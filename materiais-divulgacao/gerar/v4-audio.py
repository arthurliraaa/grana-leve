#!/usr/bin/env python3
"""Trilha simples para o vídeo (sem voz): um pad suave, uma harpa leve e um baixo discreto, em Dó maior (I–vi–IV–V), 84 bpm.
Tudo é sintetizado aqui (numpy), então não há direitos de terceiros. Uso: v4-audio.py DURACAO_EM_SEGUNDOS saida.wav"""
import sys, wave
import numpy as np

dur = float(sys.argv[1]); out = sys.argv[2]
SR = 44100; BPM = 84; beat = 60 / BPM; n = int((dur + 3) * SR)
t = np.arange(n) / SR
mix = np.zeros(n)

def nota(m): return 440.0 * 2 ** ((m - 69) / 12)
# acordes (notas MIDI) e raiz do baixo; cada acorde dura 4 tempos
acordes = [([60, 64, 67, 72], 36), ([57, 60, 64, 69], 33), ([53, 57, 60, 65], 41), ([55, 59, 62, 67], 43)]
comp = 4 * beat

def env_ad(len_s, a, rel):
    k = np.arange(int(len_s * SR)) / SR
    e = np.minimum(1, k / a) * np.exp(-k / rel)
    return e

def add(sig, start):
    i = int(start * SR); j = min(n, i + len(sig))
    if i < n: mix[i:j] += sig[:j - i]

i = 0
while i * comp < dur + 3:
    notas, baixo = acordes[i % 4]; t0 = i * comp
    # pad: senos levemente desafinados, entrada e saída lentas
    k = np.arange(int((comp + 1.2) * SR)) / SR
    e = np.minimum(1, k / 0.9) * np.minimum(1, np.maximum(0, (comp + 1.2 - k) / 1.2))
    for m in notas[:3]:
        for det in (-0.12, 0.12):
            f = nota(m) * 2 ** (det / 12)
            add(0.05 * e * (np.sin(2 * np.pi * f * k) + 0.25 * np.sin(2 * np.pi * 2 * f * k)), t0)
    # baixo
    kb = np.arange(int(comp * SR)) / SR
    add(0.13 * np.sin(2 * np.pi * nota(baixo) * kb) * np.minimum(1, kb / 0.05) * np.exp(-kb / 2.2), t0)
    # harpa: arpejo em colcheias, com acento suave
    padrao = [0, 1, 2, 3, 2, 1, 2, 1]
    for s, idx in enumerate(padrao):
        m = notas[idx] + 12 if idx else notas[0] + 12
        ks = np.arange(int(1.4 * SR)) / SR
        f = nota(m)
        v = (np.sin(2 * np.pi * f * ks) + 0.35 * np.sin(2 * np.pi * 2 * f * ks) * np.exp(-ks * 6)) * env_ad(1.4, 0.004, 0.35)
        add(0.07 * (1.15 if s % 4 == 0 else 0.85) * v, t0 + s * beat / 2)
    i += 1

# um eco/reverb curto (cauda de ruído que decai) para amaciar
rng = np.random.default_rng(7)
ir_len = int(1.6 * SR); ir = rng.standard_normal(ir_len) * np.exp(-np.arange(ir_len) / (0.35 * SR)); ir[0] = 0
wet = np.fft.irfft(np.fft.rfft(mix, n + ir_len) * np.fft.rfft(ir, n + ir_len))[:n]
wet /= (np.max(np.abs(wet)) + 1e-9)
mix = mix / (np.max(np.abs(mix)) + 1e-9) * 0.8 + wet * 0.22
mix = mix[: int(dur * SR)]
# entrada de 1,5 s e saída de 3 s
mix *= np.minimum(1, t[: len(mix)] / 1.5) * np.minimum(1, np.maximum(0, (dur - t[: len(mix)]) / 3.0))
mix = mix / np.max(np.abs(mix)) * 0.7
pcm = (mix * 32767).astype('<i2')
with wave.open(out, 'wb') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print('trilha pronta:', round(len(pcm) / SR, 1), 's')
