#!/usr/bin/env python3
"""Sintetiza la música y los efectos del Duelo (obra original, generada por código).

Uso:  python tools/make_duelo_audio.py
Salida: assets/duelo/audio/*.mp3   (requiere numpy, scipy y ffmpeg)

Todo se compone y sintetiza aquí: no se copia ninguna melodía, muestra ni sonido de terceros.
Es síntesis por software (cuerdas, metales y coro "de sintetizador", percusión, reverb), no una
grabación orquestal: para una banda sonora profesional se pueden reemplazar los mp3 por otros
con el mismo nombre sin tocar el código (ver assets/duelo/audio/LEEME.txt).
"""
import os, subprocess, sys, tempfile, wave
import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve

SR = 44100
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'duelo', 'audio')
rng = np.random.default_rng(20261020)


# ---------------------------------------------------------------- utilidades
def t_(d): return np.arange(int(d * SR)) / SR
def hz(n): return 440.0 * 2 ** ((n - 69) / 12)            # nota MIDI -> Hz
NOTE = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}
def midi(s):                                              # 'D4', 'Bb3', 'F#5'
    n = NOTE[s[0]]; i = 1
    while s[i] in '#b': n += 1 if s[i] == '#' else -1; i += 1
    return 12 * (int(s[i:]) + 1) + n

def lp(x, f, o=2): return sosfilt(butter(o, min(f, SR * .45), 'low', fs=SR, output='sos'), x)
def hp(x, f, o=2): return sosfilt(butter(o, f, 'high', fs=SR, output='sos'), x)
def bp(x, f0, f1, o=2): return sosfilt(butter(o, [f0, min(f1, SR * .45)], 'band', fs=SR, output='sos'), x)
def env(n, a=.01, d=.1, s=.7, r=.1):
    e = np.ones(n); a = int(a * SR); d = int(d * SR); r = int(r * SR)
    a = min(a, n); e[:a] = np.linspace(0, 1, a, endpoint=False) if a else 1
    d = min(d, n - a); e[a:a + d] = np.linspace(1, s, d); e[a + d:] = s
    r = min(r, n); e[n - r:] *= np.linspace(1, 0, r)
    return e
def expd(n, tau): return np.exp(-np.arange(n) / SR / tau)
def noise(n): return rng.standard_normal(n)
def saw(f, n, ph=0.): return 2 * ((np.cumsum(np.full(n, f / SR)) + ph) % 1) - 1
def sq(f, n): return np.sign(np.sin(2 * np.pi * np.cumsum(np.full(n, f / SR))))
def sine(f, n): return np.sin(2 * np.pi * np.cumsum(np.broadcast_to(f, (n,)) / SR) if np.ndim(f) else 2 * np.pi * f * np.arange(n) / SR)
def sweep(f0, f1, n, curve=1.):
    u = np.linspace(0, 1, n) ** curve; f = f0 + (f1 - f0) * u
    return np.sin(2 * np.pi * np.cumsum(f) / SR)

def add(*xs):
    xs = [np.asarray(x) for x in xs if np.ndim(x) > 0]
    n = max(x.shape[-1] for x in xs); return sum(np.pad(x, [(0, 0)] * (x.ndim - 1) + [(0, n - x.shape[-1])]) for x in xs)
def stereo(x): return np.stack([x, x])
def pan(x, p):                                           # p -1..1
    a = (p + 1) * np.pi / 4; return np.stack([x * np.cos(a), x * np.sin(a)])
def place(buf, x, start):                                # suma x (1D o 2D) en buf (2,N) desde `start` seg
    i = int(start * SR)
    if x.ndim == 1: x = stereo(x)
    j = min(buf.shape[1], i + x.shape[1])
    if i < buf.shape[1]: buf[:, i:j] += x[:, :j - i]

_ir_cache = {}
def reverb(x, sec=2.6, wet=.3, damp=5000):
    key = (sec, damp)
    if key not in _ir_cache:
        n = int(sec * SR); irs = []
        for _ in range(2):
            ir = lp(noise(n), damp) * np.exp(-np.arange(n) / SR / (sec / 5.5))
            ir[:int(.012 * SR)] *= np.linspace(0, 1, int(.012 * SR))
            irs.append(ir / np.sqrt(np.sum(ir ** 2)))
        _ir_cache[key] = np.stack(irs)
    ir = _ir_cache[key]
    if x.ndim == 1: x = stereo(x)
    w = np.stack([fftconvolve(x[0], ir[0]), fftconvolve(x[1], ir[1])])[:, :x.shape[1] + int(sec * SR)]
    d = np.zeros_like(w); d[:, :x.shape[1]] = x
    return d * (1 - wet) + w * wet * 1.4

def fit(x, n):
    if x.shape[-1] >= n: return x[..., :n]
    return np.pad(x, [(0, 0)] * (x.ndim - 1) + [(0, n - x.shape[-1])])

def loopfold(x, n):
    """Pliega la cola de reverb sobre el principio para que el bucle no tenga corte."""
    y = x[:, :n].copy(); tail = x[:, n:]
    k = min(tail.shape[1], n); y[:, :k] += tail[:, :k]; return y

def norm(x, peak=.89):
    m = np.max(np.abs(x)) or 1; return x / m * peak

def fade(x, a=.005, r=.02):
    n = x.shape[-1]; a = int(a * SR); r = int(r * SR)
    if a: x[..., :a] *= np.linspace(0, 1, a)
    if r: x[..., -r:] *= np.linspace(1, 0, r)
    return x

def write(name, x, loopable=False):
    os.makedirs(OUT, exist_ok=True)
    x = norm(x); pcm = (np.clip(x.T, -1, 1) * 32767).astype('<i2')
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f: tmp = f.name
    with wave.open(tmp, 'wb') as w: w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
    dst = os.path.join(OUT, name + '.mp3')
    br = '112k' if loopable else '80k'
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', tmp, '-codec:a', 'libmp3lame', '-b:a', br, dst], check=True)
    os.unlink(tmp); print(f'  {name}.mp3  {x.shape[1] / SR:5.1f}s  {os.path.getsize(dst) // 1024} KB')


# ---------------------------------------------------------------- instrumentos
def pad(freqs, dur, a=1.2, r=1.5, cut=1400, vol=1.):
    n = int(dur * SR); y = np.zeros(n)
    for f in freqs:
        for dt in (-7, -2.5, 0, 3, 8):                     # coro de dientes de sierra desafinados
            y += saw(f * 2 ** (dt / 1200), n, rng.random()) * .5
    y = lp(y, cut) * env(n, a, .3, .85, r) * (.85 + .15 * np.sin(2 * np.pi * .3 * t_(dur)))
    return y * vol / max(1, len(freqs)) * .5

def strings(f, dur, vol=1., stac=False, cut=2600):
    n = int(dur * SR); y = np.zeros(n)
    for dt in (-9, -3, 4, 10):
        y += saw(f * 2 ** (dt / 1200), n, rng.random())
    vib = 1 + .003 * np.sin(2 * np.pi * 5.2 * t_(dur) + rng.random() * 6)
    y = lp(y * vib, cut * (.6 if stac else 1)) * (env(n, .02, .08, .4, .07) if stac else env(n, .12, .1, .9, .25))
    return y * vol * .25

def brass(f, dur, vol=1., cut=3200):
    n = int(dur * SR); y = saw(f, n) + .6 * saw(f * 1.004, n) + .5 * saw(f * .5, n)
    sweepc = np.linspace(600, cut, n) * np.minimum(1, np.linspace(0, 1, n) * 6 + .3)
    # filtro con corte variable por bloques
    out = np.zeros(n); blk = 1024
    for i in range(0, n, blk):
        seg = y[i:i + blk]; c = float(sweepc[min(i, n - 1)])
        out[i:i + blk] = sosfilt(butter(2, c, 'low', fs=SR, output='sos'), np.pad(seg, (0, 0)))
    vib = 1 + .004 * np.sin(2 * np.pi * 5.5 * t_(dur)) * np.minimum(1, t_(dur) / .4)
    return out * vib * env(n, .06, .1, .85, .15) * vol * .3

def choir(freqs, dur, vol=1., a=1.4, r=1.8):
    n = int(dur * SR); y = np.zeros(n)
    for f in freqs:
        v = saw(f, n, rng.random()) + .7 * saw(f * 1.006, n, rng.random()) + .6 * saw(f * .994, n, rng.random())
        # formantes de la vocal "a" / "o"
        y += bp(v, 650, 900) * 1.0 + bp(v, 1050, 1300) * .6 + bp(v, 2400, 2800) * .25
    y += lp(noise(n), 6000) * .04 * np.ones(n)
    return y * env(n, a, .3, .9, r) * vol * .35 / max(1, len(freqs))

def taiko(vol=1., f=70, ln=1.2):
    n = int(ln * SR); b = sweep(f * 2.2, f, n, .25) * expd(n, .28)
    c = lp(noise(n), 900) * expd(n, .02) * .8 + sine(f * 1.5, n) * expd(n, .08) * .3
    return (b + c) * vol

def timp(f=55, ln=2., vol=1.):
    n = int(ln * SR); y = sweep(f * 1.7, f, n, .12) * expd(n, .55)
    y += .4 * sweep(f * 2.9, f * 1.9, n, .12) * expd(n, .3) + lp(noise(n), 500) * expd(n, .02) * .5
    return y * vol

def pluck(f, dur=1.4, vol=1., bright=.5):
    n = int(dur * SR); y = np.zeros(n)
    for k, a in enumerate([1, .55 * bright + .2, .3 * bright, .18 * bright, .1 * bright], 1):
        y += a * np.sin(2 * np.pi * f * k * np.arange(n) / SR + .1 * k) * expd(n, dur / (1.2 + k * .9))
    return y * vol * .5 * env(n, .002, .05, 1, .02)

def bell(f, dur=2.5, vol=1.):
    n = int(dur * SR); y = np.zeros(n)
    for r, a in ((1, 1), (2.76, .5), (5.4, .3), (8.93, .15)):
        y += a * np.sin(2 * np.pi * f * r * np.arange(n) / SR) * expd(n, dur / (2 + r * .8))
    return y * vol * .3

def cymbal(dur=2.2, vol=1., rise=0.):
    n = int(dur * SR); y = hp(noise(n), 5200)
    e = expd(n, dur / 3.5) if rise <= 0 else np.linspace(0, 1, n) ** 3 * expd(n, 3)
    return y * e * vol * .25

def bass(f, dur, vol=1.):
    n = int(dur * SR); y = lp(saw(f, n) + .8 * sine(f, n), 380)
    return y * env(n, .03, .1, .9, .2) * vol * .5


# ---------------------------------------------------------------- composición
def chord(root, kind):
    iv = {'m': (0, 3, 7), 'M': (0, 4, 7), 'm7': (0, 3, 7, 10), 'M7': (0, 4, 7, 11), 'sus': (0, 5, 7)}[kind]
    return [root + i for i in iv]

PROG_MENU = [('D', 2, 'm'), ('Bb', 1, 'M'), ('F', 2, 'M'), ('C', 2, 'M')]    # Dm  Bb  F  C
def rootmidi(n, o): return midi(f'{n}{o}')

def music_menu():
    bpm = 70; beat = 60 / bpm; bar = beat * 4; bars = 16; total = bars * bar
    N = int(total * SR); buf = np.zeros((2, N + int(4 * SR)))
    # melodía original (motivo "llamada de aventura"): 4 compases se repiten con variación
    mel = [
        [('A4', 2), ('D5', 1), ('C5', 1)], [('Bb4', 3), ('A4', 1)], [('A4', 2), ('C5', 1), ('F5', 1)], [('E5', 3), ('D5', 1)],
        [('A4', 2), ('D5', 1), ('C5', 1)], [('Bb4', 2), ('D5', 2)], [('C5', 2), ('A4', 1), ('G4', 1)], [('A4', 4)],
    ]
    for b in range(bars):
        name, o, kind = PROG_MENU[b % 4]; r = rootmidi(name, o); t0 = b * bar
        ch = chord(r + 12, kind)
        place(buf, pad([hz(m) for m in ch], bar + 1.2, a=1.6, r=1.8, cut=1100, vol=.9), t0)
        place(buf, pad([hz(r - 12 + 12)], bar + .6, a=.8, r=1.2, cut=300, vol=1.1), t0)
        # arpa: arpegio suave
        arp = chord(r + 24, kind); seq = [0, 1, 2, 1, 2, 1, 0, 1]
        for i, k in enumerate(seq):
            place(buf, pan(pluck(hz(arp[k % len(arp)]), 1.5, .5 if b >= 2 else .28), -.35 + .1 * (i % 3)), t0 + i * beat * .5)
        if b % 4 == 0: place(buf, pan(timp(hz(r), 2.4, .6), 0), t0)
        if b % 4 == 2: place(buf, pan(timp(hz(r + 7), 2., .35), 0), t0 + beat * 2)
    # melodía: se coloca por separado (cada elemento (nota, pulsos))
    for b in range(4, bars):
        m = mel[(b - 4) % 8]; tt = b * bar
        for n, d in m:
            lead = strings(hz(midi(n)), d * beat * 1.05, .9, cut=3000); lead = lead + .45 * fit(pluck(hz(midi(n)) * 2, 1.2, .3), len(lead))
            place(buf, pan(lead, .15), tt); tt += d * beat
    place(buf, bell(hz(midi('D6')), 3.5, .5), 0); place(buf, bell(hz(midi('A5')), 3.5, .35), 8 * bar)
    wet = reverb(buf, 3.2, .38, 4200)
    return loopfold(wet, N)

def music_prep():
    bpm = 84; beat = 60 / bpm; bar = beat * 4; bars = 16; N = int(bars * bar * SR)
    buf = np.zeros((2, N + int(4 * SR)))
    prog = [('E', 2, 'm'), ('C', 2, 'M'), ('D', 2, 'M'), ('B', 1, 'm')]
    for b in range(bars):
        name, o, kind = prog[b % 4]; r = rootmidi(name, o); t0 = b * bar
        place(buf, pad([hz(m) for m in chord(r + 12, kind)], bar + 1, a=.9, r=1.2, cut=1500, vol=.9), t0)
        place(buf, bass(hz(r), beat * .9, .9), t0 + 0); place(buf, bass(hz(r), beat * .9, .7), t0 + beat * 2.5)
        for i in range(8):                                   # pulso de cuerdas cortas, crece con el tiempo
            place(buf, pan(strings(hz(r + 12 + (7 if i % 4 == 3 else 0)), beat * .4, .55 + .45 * min(1, b / 10), stac=True), -.3 + .08 * i), t0 + i * beat * .5)
        place(buf, pan(taiko(.5 + .4 * min(1, b / 8), 68, 1.0), 0), t0)
        if b >= 4: place(buf, pan(taiko(.45, 80, .8), .2), t0 + beat * 2)
        if b >= 8: place(buf, pan(taiko(.35, 75, .7), -.2), t0 + beat * 3)
        if b % 8 == 7: place(buf, cymbal(3, .9, rise=1), t0 + bar * .2)
        if b % 4 == 3 and b >= 8: place(buf, choir([hz(m) for m in chord(r + 24, kind)], bar, .5, a=1.0), t0)
    return loopfold(reverb(buf, 2.4, .3, 4800), N)

def music_battle(intense=False):
    bpm = 132 if intense else 116; beat = 60 / bpm; bar = beat * 4; bars = 24; N = int(bars * bar * SR)
    buf = np.zeros((2, N + int(4 * SR)))
    prog = [('D', 2, 'm'), ('Bb', 1, 'M'), ('F', 2, 'M'), ('A', 1, 'M')]
    motif = [('D5', 1.5), ('D5', .5), ('F5', 1), ('A5', 1), ('G5', 1.5), ('F5', .5), ('E5', 1), ('D5', 1)]   # motivo del combate
    motif2 = [('Bb4', 1), ('D5', 1), ('F5', 2), ('E5', 1), ('C#5', 1), ('A4', 2), ('A4', 4)]
    for b in range(bars):
        name, o, kind = prog[b % 4]; r = rootmidi(name, o); t0 = b * bar
        sec = 0 if b < 4 else 1 if b < 12 else 2 if b < 20 else 3          # A (intro) B (tema) C (clímax) D (cierre)
        place(buf, pad([hz(m) for m in chord(r + 12, kind)], bar + .8, a=.5, r=.9, cut=1800, vol=.8), t0)
        place(buf, bass(hz(r), beat * .9, 1.), t0); place(buf, bass(hz(r), beat * .45, .8), t0 + beat * 1.5); place(buf, bass(hz(r + (7 if b % 2 else 0)), beat * .9, .8), t0 + beat * 2.5)
        # ostinato de cuerdas en corcheas
        for i in range(8):
            nn = r + 24 + (0, 7, 12, 7, 0, 7, 12, 15 if kind == 'm' else 16)[i]
            place(buf, pan(strings(hz(nn), beat * .42, .8 if sec else .45, stac=True, cut=3400), -.45 + .13 * i), t0 + i * beat * .5)
        # percusión
        place(buf, pan(taiko(1., 62, 1.2), -.1), t0); place(buf, pan(taiko(.8, 70, .9), .1), t0 + beat * 1.5)
        place(buf, pan(taiko(.9, 64, 1.1), 0), t0 + beat * 2); place(buf, pan(taiko(.55, 78, .7), .15), t0 + beat * 3.5)
        if sec >= 1:
            for i in range(8): place(buf, pan(taiko(.28, 95 + 8 * (i % 2), .3), (-.3 if i % 2 else .3)), t0 + i * beat * .5)
        if sec >= 2: place(buf, cymbal(2.4, .8), t0)
        if b % 4 == 0 and sec >= 1: place(buf, timp(hz(r), 2.2, .9), t0)
        # tema en metales
        if sec == 1 or sec == 2:
            m = motif if b % 4 in (0, 1) else motif2 if b % 4 == 2 else None
            if b % 4 in (0, 2):
                tt = t0; seq = motif if b % 4 == 0 else motif2
                for n, d in seq:
                    if tt - t0 < bar * 2 - 1e-6:
                        place(buf, pan(brass(hz(midi(n)), d * beat * 1.02, 1., 3600 if sec == 2 else 2800), .1), tt)
                        if sec == 2: place(buf, pan(strings(hz(midi(n)) * 2, d * beat * 1.02, .6, cut=4500), -.2), tt)
                    tt += d * beat
        if sec == 2 and b % 2 == 0: place(buf, choir([hz(m) for m in chord(r + 24, kind)], bar * 2, .85, a=.6, r=1.6), t0)
        if sec == 3 and b % 4 == 0: place(buf, choir([hz(r + 24)], bar * 2, .5), t0)
        if b % 8 == 7: place(buf, cymbal(3, 1., rise=1), t0 + bar * .15)
    return loopfold(reverb(buf, 2.2, .26, 5500), N)

def music_ambient():
    n = int(32 * SR); x = np.zeros((2, n))
    for ch in range(2):
        w = lp(noise(n), 600) * (.5 + .5 * np.sin(2 * np.pi * (1 / 9.7) * t_(32) + ch)) * .6 + bp(noise(n), 1200, 2800) * .05 * (.5 + .5 * np.sin(2 * np.pi * (1 / 6.1) * t_(32) + 1 + ch))
        x[ch] += w
    for _ in range(70):                                       # chasquidos de fuego
        s = rng.random() * 31.7; k = int(rng.uniform(.004, .03) * SR); c = hp(noise(k), 900) * expd(k, .006) * rng.uniform(.2, 1)
        place(x, pan(c, rng.uniform(-.8, .8)), s)
    for _ in range(5):                                        # pájaros lejanos
        s = rng.random() * 29; f0 = rng.uniform(2400, 3600); k = int(.18 * SR)
        place(x, pan(sweep(f0, f0 * 1.25, k, 1.) * env(k, .01, .05, .6, .08) * .08, rng.uniform(-.8, .8)), s)
    # cierra el bucle con fundido cruzado
    f = int(1.5 * SR); x[:, :f] = x[:, :f] * np.linspace(0, 1, f) + x[:, -f:] * np.linspace(1, 0, f); return x[:, :-f]

def stinger_win():
    buf = np.zeros((2, int(10 * SR)))
    for i, (n, t) in enumerate([('D4', 0), ('A4', .22), ('D5', .44), ('F5', .66), ('A5', .95)]):
        place(buf, brass(hz(midi(n)), .5 if i < 4 else 2.6, 1., 3800), t)
    for m in chord(midi('D4'), 'M'):                       # acorde mayor final (Picardía)
        place(buf, pad([hz(m + 12)], 5, a=.3, r=2, cut=2600), .95)
    place(buf, choir([hz(midi('D5')), hz(midi('F#5')), hz(midi('A5'))], 4.2, 1., a=.5, r=2), .95)
    place(buf, timp(hz(38), 2.6, 1.), 0); place(buf, timp(hz(50), 2.6, 1.), .95); place(buf, cymbal(4, 1.), .95)
    for i, m in enumerate(['D6', 'F#6', 'A6', 'D7']): place(buf, bell(hz(midi(m)), 3, .45), 1.2 + i * .12)
    return reverb(buf, 3., .35)[:, :int(9.5 * SR)]

def stinger_lose():
    buf = np.zeros((2, int(10 * SR)))
    for n, t in [('A4', 0), ('G4', .55), ('F4', 1.1), ('D4', 1.8)]:
        place(buf, strings(hz(midi(n)), 1.6 if t < 1.8 else 4.5, 1.2, cut=1800), t)
    for m in chord(midi('D3'), 'm'): place(buf, pad([hz(m)], 6, a=.5, r=2.5, cut=900, vol=1.2), 1.8)
    place(buf, timp(hz(36), 3., 1.), 1.8); place(buf, timp(hz(31), 3., .7), .0); place(buf, cymbal(4, .5), 1.8)
    place(buf, bell(hz(midi('A5')), 4, .3), 2.4)
    return reverb(buf, 3.6, .42)[:, :int(9.5 * SR)]


# ---------------------------------------------------------------- efectos
def blip(f0, f1, dur, vol=.6, wave='sine'):
    n = int(dur * SR); y = sweep(f0, f1, n) if wave == 'sine' else sq(np.linspace(f0, f1, n).mean(), n) * .4
    return y * env(n, .003, dur * .3, .5, dur * .5) * vol

def click(vol=.5, f=1800): n = int(.05 * SR); return (sine(f, n) * .6 + lp(noise(n), 5000) * .25) * expd(n, .012) * vol
def tick(vol=.25): n = int(.03 * SR); return sine(2600, n) * expd(n, .006) * vol

def sfx_all():
    S = {}
    # ----- interfaz
    S['ui_hover'] = stereo(add(tick(.3), .0))
    S['ui_click'] = stereo(add(click(.55, 1500), .3 * blip(900, 700, .06, .5)))
    S['ui_confirm'] = stereo(np.concatenate([blip(520, 520, .09, .5), blip(780, 780, .2, .55)]))
    S['ui_cancel'] = stereo(np.concatenate([blip(520, 520, .08, .45), blip(340, 300, .16, .45)]))
    S['ui_open'] = stereo(add(sweep(300, 900, int(.22 * SR)) * env(int(.22 * SR), .02, .05, .6, .15) * .4, lp(noise(int(.22 * SR)), 3000) * np.linspace(0, 1, int(.22 * SR)) * expd(int(.22 * SR), .12) * .12))
    S['ui_close'] = stereo(sweep(900, 300, int(.2 * SR)) * env(int(.2 * SR), .01, .05, .6, .14) * .38)
    S['ui_tab'] = stereo(add(click(.4, 2300), tick(.2)))
    S['notify'] = stereo(add(np.concatenate([bell(hz(81), .9, .5)[:int(.5 * SR)], ]) * 1.2, np.pad(bell(hz(88), .9, .5), (int(.12 * SR), 0))[:int(.5 * SR)]))
    S['error'] = stereo(np.concatenate([blip(200, 180, .09, .55, 'sq'), np.zeros(int(.04 * SR)), blip(170, 150, .14, .55, 'sq')]))
    # ----- cartas
    n = int(.14 * SR)
    S['card_select'] = stereo(add(hp(noise(n), 2500) * expd(n, .025) * .4, sine(1100, n) * expd(n, .03) * .35))
    n = int(.3 * SR)
    S['card_inspect'] = stereo(add(lp(noise(n), 2000) * np.sin(np.linspace(0, np.pi, n)) * .22, bell(hz(96), .6, .22)[:n]))
    n = int(.5 * SR)
    place_buf = np.zeros((2, n)); place(place_buf, stereo(hp(noise(int(.1 * SR)), 1500) * expd(int(.1 * SR), .03) * .5), 0)
    place(place_buf, stereo(add(lp(noise(int(.18 * SR)), 450) * expd(int(.18 * SR), .05) * .8, sine(110, int(.18 * SR)) * expd(int(.18 * SR), .06) * .5)), .09)
    place(place_buf, stereo(bell(hz(93), .7, .35)[:int(.4 * SR)]), .1); S['card_place'] = place_buf
    n = int(1.3 * SR)
    sm = np.zeros((2, n)); place(sm, stereo(add(sweep(200, 1500, int(.5 * SR), 2.) * env(int(.5 * SR), .01, .1, .5, .3) * .4, lp(noise(int(.5 * SR)), 5000) * np.linspace(0, 1, int(.5 * SR)) ** 2 * .3)), 0)
    place(sm, stereo(add(timp(70, 1., .8), lp(noise(int(.5 * SR)), 1500) * expd(int(.5 * SR), .08) * .4)), .42)
    for i, m in enumerate([84, 88, 91, 96]): place(sm, stereo(bell(hz(m), 1.2, .4)[:int(.8 * SR)]), .48 + i * .06)
    S['card_summon'] = sm
    n = int(2.4 * SR)
    ep = np.zeros((2, n)); place(ep, stereo(add(sweep(60, 800, int(1.0 * SR), 2.5) * env(int(1.0 * SR), .05, .2, .8, .2) * .45, hp(noise(int(1.0 * SR)), 2000) * np.linspace(0, 1, int(1.0 * SR)) ** 3 * .35)), 0)
    place(ep, stereo(add(timp(48, 1.6, 1.2), taiko(.8, 50, 1.2)[:int(1.6 * SR)])), .95)
    place(ep, stereo(choir([hz(62), hz(66), hz(69), hz(74)], 1.5, .9, a=.2, r=.9)), .9); place(ep, stereo(cymbal(1.6, .9)), .95)
    for i, m in enumerate([88, 93, 97, 100]): place(ep, stereo(bell(hz(m), 1.4, .45)[:int(1.2 * SR)]), 1.0 + i * .08)
    S['card_epic'] = ep
    n = int(.4 * SR); S['card_set'] = stereo(add(lp(noise(n), 900) * env(n, .01, .05, .6, .25) * .5, sine(150, n) * expd(n, .08) * .5))
    n = int(.5 * SR); S['card_flip'] = stereo(add(hp(noise(n), 2000) * np.sin(np.linspace(0, np.pi, n)) ** 2 * .3, bell(hz(100), .7, .35)[:n]))
    n = int(.22 * SR); S['draw'] = stereo(add(hp(noise(n), 1800) * np.sin(np.linspace(0, np.pi, n)) * .35, sine(700, n) * expd(n, .05) * .2))
    S['turn_end'] = stereo(add(timp(90, .8, .9)[:int(.6 * SR)], bell(hz(79), .8, .4)[:int(.6 * SR)]))
    S['turn_start'] = stereo(np.concatenate([bell(hz(72), .7, .45)[:int(.25 * SR)], bell(hz(79), .9, .5)[:int(.6 * SR)]]))
    # ----- combate
    def noisehit(ln, f, vol, tau): k = int(ln * SR); return lp(noise(k), f) * expd(k, tau) * vol
    n = int(.55 * SR)
    S['atk_phys'] = stereo(add(hp(noise(n), 500) * np.sin(np.linspace(0, np.pi, n)) ** 3 * .45, sweep(900, 200, n) * expd(n, .1) * .25))       # tajo / golpe de aire
    mg = np.zeros((2, int(1.0 * SR))); k = int(.7 * SR)
    place(mg, stereo(add(sweep(400, 2400, k, 1.5) * env(k, .02, .1, .6, .4) * .3, sweep(404, 2430, k, 1.5) * env(k, .02, .1, .6, .4) * .25, bp(noise(k), 2000, 6000) * np.linspace(0, 1, k) * .15)), 0)
    for i, m in enumerate([96, 100, 103]): place(mg, stereo(bell(hz(m), .8, .3)[:int(.5 * SR)]), .5 + i * .05)
    S['atk_magic'] = mg
    k = int(1.1 * SR); f = lp(noise(k), 3000) * (np.sin(np.linspace(0, np.pi, k)) ** .8) * (.7 + .5 * lp(noise(k), 30)) * .5
    S['atk_fire'] = stereo(add(f, noisehit(1.1, 400, .45, .35), sweep(150, 90, k) * expd(k, .4) * .35))
    k = int(1.0 * SR)
    S['atk_water'] = stereo(add(bp(noise(k), 300, 2500) * np.sin(np.linspace(0, np.pi, k)) ** .6 * .5, sweep(300, 120, k) * expd(k, .3) * .4))
    k = int(.9 * SR); el = np.zeros(k)
    for i in range(14):
        s = int(rng.uniform(0, .6) * SR); m = int(rng.uniform(.01, .05) * SR); el[s:s + m] += hp(noise(m), 2500) * expd(m, .01) * rng.uniform(.4, 1) * .9
    el += sq(60, k) * expd(k, .35) * .2 + bp(noise(k), 3000, 9000) * expd(k, .15) * .3
    S['atk_electric'] = stereo(el)
    k = int(1.0 * SR); ic = np.zeros(k)
    for i, m in enumerate([108, 112, 115, 120, 124]):
        s = int((.03 + i * .05) * SR); b = bell(hz(m), .5, .4)[:k - s]; ic[s:s + b.shape[0]] += b
    ic += hp(noise(k), 4000) * expd(k, .12) * .2 + sweep(2400, 800, k) * expd(k, .12) * .15
    S['atk_ice'] = stereo(ic)
    k = int(.9 * SR)
    S['atk_nature'] = stereo(add(bp(noise(k), 1500, 7000) * np.sin(np.linspace(0, np.pi, k)) * (.6 + .5 * lp(noise(k), 18)) * .45, sweep(500, 900, k) * env(k, .1, .2, .3, .5) * .12))
    k = int(1.2 * SR); my = np.zeros((2, k))
    place(my, stereo(add(sweep(220, 700, k, 1.2) * env(k, .1, .2, .6, .5) * .25, sweep(330, 1050, k, 1.2) * env(k, .1, .2, .6, .5) * .18, sine(80, k) * expd(k, .5) * .3)), 0)
    place(my, stereo(choir([hz(60), hz(63), hz(67)], 1., .55, a=.25, r=.6)), .1)
    S['atk_mystic'] = my
    n = int(.5 * SR); S['hit'] = stereo(add(noisehit(.5, 1800, .8, .05), sine(95, n) * expd(n, .12) * .8))
    n = int(1.0 * SR); S['hit_heavy'] = stereo(add(timp(52, 1., 1.) * .9, noisehit(1., 1400, .8, .12), sweep(300, 40, n) * expd(n, .25) * .6))
    n = int(1.2 * SR); cr = np.zeros((2, n)); place(cr, S['hit_heavy'][:, :int(1.0 * SR)], 0); place(cr, stereo(cymbal(1., .6)), 0)
    for i, m in enumerate([103, 108]): place(cr, stereo(bell(hz(m), .8, .35)[:int(.7 * SR)]), .05 + i * .08)
    S['crit'] = cr
    n = int(.6 * SR); S['hurt'] = stereo(add(noisehit(.6, 1000, .6, .08), sweep(220, 70, n) * expd(n, .2) * .7))
    k = int(.9 * SR); sh = np.zeros((2, k))
    place(sh, stereo(add(np.pad(bell(hz(79), .8, .8)[:int(.7 * SR)], (0, int(.2 * SR))), np.pad(sweep(500, 1800, int(.25 * SR)) * env(int(.25 * SR), .01, .05, .6, .15) * .3, (0, int(.65 * SR))))), 0)
    place(sh, stereo(bp(noise(int(.5 * SR)), 2500, 8000) * expd(int(.5 * SR), .12) * .22), 0)
    S['shield'] = sh
    n = int(1.2 * SR); S['destroy'] = stereo(add(noisehit(1.2, 2500, .8, .2), sweep(250, 35, n) * expd(n, .35) * .7, hp(noise(n), 4000) * expd(n, .06) * .25))
    n = int(2.2 * SR); S['explosion'] = stereo(add(noisehit(2.2, 1800, 1., .5), sweep(120, 28, n) * expd(n, .7) * 1., timp(40, 2.2, .8)[:n], lp(noise(n), 300) * expd(n, 1.0) * .8))
    k = int(1.6 * SR); hl = np.zeros((2, k))
    for i, m in enumerate([76, 80, 83, 88, 92]): place(hl, stereo(add(bell(hz(m), 1.2, .5)[:int(1. * SR)] * 1., pluck(hz(m), .8, .3)[:int(.8 * SR)])), i * .1)
    place(hl, stereo(pad([hz(64), hz(68), hz(71)], 1.4, a=.2, r=.8, cut=2500) * 2), 0)
    S['heal'] = hl
    k = int(1.0 * SR); sp = np.zeros((2, k))
    place(sp, stereo(add(sweep(250, 1800, int(.6 * SR), 1.6) * env(int(.6 * SR), .03, .1, .6, .3) * .35, bp(noise(int(.6 * SR)), 2500, 9000) * np.linspace(0, 1, int(.6 * SR)) * .12)), 0)
    for i, m in enumerate([91, 95, 98, 103]): place(sp, stereo(bell(hz(m), .8, .35)[:int(.6 * SR)]), .45 + i * .05)
    S['spell'] = sp
    k = int(1.0 * SR); tr = np.zeros((2, k))
    place(tr, stereo(add(sweep(900, 150, int(.35 * SR)) * env(int(.35 * SR), .005, .05, .7, .2) * .45, sq(120, int(.3 * SR)) * expd(int(.3 * SR), .08) * .25)), 0)
    place(tr, stereo(add(np.pad(noisehit(.5, 2400, .5, .06), (0, int(.4 * SR))), timp(70, .9, .7)[:int(.9 * SR)])), .25)
    S['trap'] = tr
    n = int(.9 * SR); S['negate'] = stereo(add(sweep(900, 100, n) * env(n, .005, .1, .5, .4) * .5, sq(150, n) * expd(n, .15) * .25, noisehit(.9, 3000, .3, .08)))
    n = int(.8 * SR); S['eff'] = stereo(np.concatenate([bell(hz(88), .6, .5)[:int(.18 * SR)], bell(hz(95), .9, .6)[:int(.6 * SR)]]))
    n = int(.7 * SR); S['noteff'] = stereo(np.concatenate([sweep(500, 330, int(.25 * SR)) * env(int(.25 * SR), .01, .05, .5, .12) * .4, sweep(330, 220, int(.4 * SR)) * env(int(.4 * SR), .01, .05, .5, .25) * .35]))
    n = int(.35 * SR); S['flip_pos'] = stereo(add(lp(noise(n), 1200) * np.sin(np.linspace(0, np.pi, n)) * .4, sine(180, n) * expd(n, .07) * .4))
    return S


def main():
    os.makedirs(OUT, exist_ok=True)
    print('Música:')
    write('music_menu', music_menu(), True)
    write('music_prep', music_prep(), True)
    write('music_battle', music_battle(False), True)
    write('music_tense', music_battle(True), True)
    write('amb_arena', music_ambient(), True)
    write('jingle_win', stinger_win())
    write('jingle_lose', stinger_lose())
    print('Efectos:')
    for k, v in sfx_all().items():
        write('sfx_' + k, fade(v if v.ndim == 2 else stereo(v)))


if __name__ == '__main__':
    main()
