#!/usr/bin/env python3
"""Compose and render the original material in LEONIDA FM's demo schedule.

Run from any directory with Python 3.10+, NumPy, SciPy, ffmpeg (libmp3lame)
and ffprobe on PATH. No network, soundfonts, MIDI files or samples are used.
"""

from __future__ import annotations

import argparse
import json
import math
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

import numpy as np
from scipy import signal

ROOT = Path(__file__).resolve().parents[1]
RATE = 44100
TAU = math.tau
ARTIST = "Leonida Sound Department"


@dataclass(frozen=True)
class Cut:
    station: str
    title: str
    bpm: int
    bars: int
    key: int
    variant: int


# Keys are MIDI pitches of the root in the bass register.
CUTS = [
    Cut("flash-fm", "Heat Mirage", 114, 16, 42, 0),
    Cut("flash-fm", "Marisol After Dark", 126, 16, 47, 1),
    Cut("cocoteo-fm", "Patio de Medianoche", 103, 16, 45, 0),
    Cut("cocoteo-fm", "Calle de Cobre", 110, 16, 43, 1),
    Cut("back-country", "County Line Static", 102, 12, 43, 0),
    Cut("back-country", "Rain on the Causeway", 93, 12, 38, 1),
    Cut("the-chamber", "Salt Furnace", 152, 16, 38, 0),
    Cut("the-chamber", "Chrome Fracture", 135, 16, 40, 1),
    Cut("dirty-south", "Low Beam Ledger", 79, 12, 43, 0),
    Cut("dirty-south", "Southbound Wax", 86, 12, 46, 1),
    Cut("afro-bank", "Banyan Steps", 111, 16, 45, 0),
    Cut("afro-bank", "Copper Kettle Keys", 116, 16, 42, 1),
]


def times(seconds: float) -> np.ndarray:
    return np.arange(max(1, round(seconds * RATE)), dtype=float) / RATE


def pitch(note: float) -> float:
    return 440 * 2 ** ((note - 69) / 12)


def gate(t: np.ndarray, attack: float = 0.004, release: float = 0.040) -> np.ndarray:
    return np.minimum(1, t / attack) * np.minimum(1, np.maximum(0, t[-1] - t) / release)


def filt(x: np.ndarray, frequency: float | tuple, kind: str, order: int = 2) -> np.ndarray:
    return signal.sosfilt(signal.butter(order, frequency, btype=kind, fs=RATE, output="sos"), x)


def drum(name: str, rng: np.random.Generator, tune: float = 1) -> np.ndarray:
    lengths = {"kick": .45, "rockkick": .35, "snare": .29, "rim": .12, "clap": .30,
               "hat": .12, "open": .43, "shaker": .13, "ride": .65, "crash": 1.35,
               "conga": .29, "clave": .12, "cowbell": .20, "tom": .35, "brush": .29}
    t = times(lengths[name])
    n = rng.normal(0, 1, len(t))
    sine = np.sin
    if name in ("kick", "rockkick"):
        acoustic = name == "rockkick"
        floor = (53 if acoustic else 44) * tune
        phase = TAU * (floor * t + 3.4 * (1 - np.exp(-43*t)) + .09 * (1 - np.exp(-260*t)))
        body = sine(phase) * np.exp(-t * (13 if acoustic else 9.2))
        click = (.26 if acoustic else .10) * filt(n, (1050, 5200), "bandpass") * np.exp(-160*t)
        return np.tanh(1.22 * (body + click)) * gate(t, .0008, .022)
    if name in ("snare", "clap", "brush"):
        wire = filt(n, (750, 10800), "bandpass")
        shell = sine(TAU * (188*tune*t + .62*(1-np.exp(-47*t)))) * np.exp(-23*t)
        if name == "snare":
            sample = .51*shell + .62*wire*np.exp(-17*t) + .15*filt(n, (630, 1800), "bandpass")*np.exp(-31*t)
        elif name == "clap":
            hands = sum(np.where(t >= delay, np.exp(-np.maximum(t-delay, 0)*195), 0)
                        for delay in (0., .011, .020, .033))
            sample = filt(n, (740, 4700), "bandpass")*(.65*hands+.62*np.exp(-13*t)) + .10*shell
        else:
            sample = wire*(1-np.exp(-70*t))*np.exp(-13*t) + .13*shell
        return np.tanh(1.45*sample)*gate(t, .001, .02)
    if name in ("hat", "open", "ride", "crash", "shaker"):
        metal = sum(sine(TAU*f*t+1.8*sine(TAU*f*.713*t)) for f in (1821, 2412, 3317, 4190)) / 4
        bright = filt(n*.76+.46*metal, (5100, 15100), "bandpass")
        decay = {"hat": 51, "open": 12, "ride": 7, "crash": 4, "shaker": 36}[name]
        slow = .008 if name in ("shaker", "crash") else .0008
        return bright*np.exp(-decay*t)*gate(t, slow, .030)
    if name == "tom":
        phase = TAU * (106*tune*t + .73*(1-np.exp(-25*t)))
        return (.76*sine(phase)*np.exp(-10*t)+.16*filt(n, (300, 4000), "bandpass")*np.exp(-55*t))*gate(t)
    if name == "conga":
        fundamental = 194*tune
        phase = TAU*(fundamental*t+.72*(1-np.exp(-25*t)))
        return (.70*sine(phase)*np.exp(-17*t)+.25*sine(1.44*phase)*np.exp(-34*t)
                +.19*filt(n, (500, 3600), "bandpass")*np.exp(-100*t))*gate(t, .001, .023)
    if name == "clave":
        return (.71*sine(TAU*1840*tune*t)+.29*sine(TAU*2520*tune*t))*np.exp(-56*t)*gate(t, .001, .012)
    if name == "cowbell":
        return (sine(TAU*520*tune*t+.65*sine(TAU*710*t))+.48*sine(TAU*805*tune*t))*np.exp(-24*t)*gate(t,.001,.015)
    return (.60*sine(TAU*425*tune*t)+.35*sine(TAU*1064*tune*t)+.30*filt(n, (900, 5400), "bandpass"))*np.exp(-53*t)*gate(t,.001,.012)


def string_voice(note: float, sec: float, rng: np.random.Generator, *, steel: bool = False) -> np.ndarray:
    """Bridge-position pluck with harmonic decay, body resonances and optional pedal bend."""
    t = times(sec)
    f = pitch(note)
    position = rng.uniform(.16,.26)
    # Integrated, decaying pitch displacement gives steel notes a gentle scoop.
    phase = TAU*f*(t - (.017 if steel else .00012)*(1-np.exp(-11*t)))
    if steel:
        phase += .08*np.sin(TAU*5.5*t)*(1-np.exp(-9*t))
    wave = np.zeros(len(t))
    powers = 1.03 if steel else 1.32
    for h in range(1, min(34, int(14700/f))+1):
        pickup = math.sin(math.pi*h*position) / (h**powers)
        damping = (1.25 if steel else 2.4) + h*(.44 if steel else 1.12)
        wave += pickup * np.cos(h*phase*(1+2e-6*h*h)) * np.exp(-t*damping)
    attack = filt(rng.normal(size=len(t)), (1450, 8200), "bandpass")*np.exp(-208*t)
    wood = filt(wave, (180, 440), "bandpass")
    return (.91*wave+.24*wood+.063*attack)*gate(t, .015 if steel else .0015, .035)


def voice(name: str, note: float, sec: float, rng: np.random.Generator) -> np.ndarray:
    if name in ("guitar", "steel"):
        return string_voice(note, sec, rng, steel=name=="steel")
    t = times(sec)
    f = pitch(note)
    phi = TAU*f*t
    if name == "bass":
        return (np.sin(phi)+.28*np.sin(2*phi)*np.exp(-5*t)+.19*np.sin(3*phi)*np.exp(-9*t))*np.exp(-1.1*t)*gate(t)
    if name in ("sub", "log"):
        if name == "sub":
            bend = TAU*f*.004*(1-np.exp(-40*t))
            return np.tanh(1.5*(np.sin(phi+bend)+.14*np.sin(2*(phi+bend))))*np.exp(-1.8*t)*gate(t,.009,.055)
        bend = TAU*f*(.072*(1-np.exp(-21*t))+.007*(1-np.exp(-88*t)))
        knock = .28*np.sin(2.69*phi+1.90*np.exp(-8*t)*np.sin(phi))*np.exp(-24*t)
        return (np.sin(phi+bend)*np.exp(-6.2*t)+knock)*gate(t,.002,.045)
    if name in ("ep", "piano", "bell"):
        ratio, modulation, decay = {"ep": (2, 1.65, 2.8), "piano": (1, 1.25, 2.15), "bell": (2.71, 2.12, 2.85)}[name]
        core = np.sin(phi+modulation*np.exp(-5*t)*np.sin(phi*ratio))*.71
        overtone = .20*np.sin(2.001*phi)*np.exp(-1.9*t)+.17*np.sin(3.006*phi)*np.exp(-5.3*t)
        return (core+overtone)*np.exp(-decay*t)*gate(t,.004,.06)
    if name in ("poly", "lead", "brass"):
        # Additive, band-limited detuned oscillator voices and a natural filter envelope.
        wobble = .05*np.sin(TAU*5.1*t) if name == "lead" else 0
        phase = phi + wobble
        count = min(16, int(15400/f))
        wave = np.zeros(len(t))
        for h in range(1, count+1):
            upper = np.exp(-t*h*(2.3 if name == "brass" else .65))
            amplit = (1/h**1.30) * (.5 + .5*upper)
            wave += amplit*(np.sin(phase*h)+.42*np.sin(phase*h*1.003))
        decay = np.exp(-(.51 if name=="poly" else 1.6)*t)
        return wave*decay*gate(t, .047 if name=="poly" else .018, .09 if name=="poly" else .047)
    raise ValueError(f"Unknown synthesized instrument {name}")


def guitar_amp(root: int, sec: float, rng: np.random.Generator, palm: bool) -> np.ndarray:
    """Strike two courses into a saturating preamp before a dual-resonance cabinet."""
    t = times(sec)
    signal_in = np.zeros_like(t)
    for interval, strength in ((0,1.), (7,.69), (12,.31)):
        phase = TAU*pitch(root+interval)*rng.uniform(.9985,1.0015)*t
        origin = rng.uniform(.05,.20)
        for harmonic in range(1,17):
            weight = math.sin(math.pi*.21*harmonic)/harmonic**1.1
            signal_in += strength*weight*np.sin(harmonic*phase+origin) * np.exp(-t*harmonic*(2.7 if palm else .85))
    click = filt(rng.normal(size=len(t)), (800, 5200), "bandpass")*np.exp(-105*t)*.12
    signal_in = (signal_in+click)*np.exp(-t*(16 if palm else 2))
    preamp = np.tanh(4.6*signal_in)
    preamp = np.tanh(1.50*(preamp-.32*filt(preamp, 300, "lowpass")))
    cabinet = filt(filt(preamp, 88, "highpass"), 4100, "lowpass", 4)
    cabinet += .30*filt(cabinet, (1100, 1900), "bandpass")-.20*filt(cabinet,(270,520),"bandpass")
    return cabinet*gate(t,.0018,.025)


class Studio:
    def __init__(self, cut: Cut, seed: int):
        self.cut = cut
        self.rng = np.random.default_rng(seed)
        self.beat = 60/cut.bpm
        self.frames = round(self.beat*4*cut.bars*RATE)
        self.mix = np.zeros((self.frames,2), dtype=np.float32)
        self.room = np.zeros_like(self.mix)
        self.echo = np.zeros_like(self.mix)

    def place(self, beat: float, mono: np.ndarray, gain: float, pan: float, room: float, echo: float = 0):
        # Wrap natural tails around the complete cue for clean absolute-time rejoins.
        start = round(beat*self.beat*RATE) % self.frames
        angle = (max(-1.,min(1.,pan))+1)*math.pi/4
        stereo = (mono[:,None]*np.array([math.cos(angle),math.sin(angle)])*gain).astype(np.float32)
        first = min(self.frames-start,len(stereo))
        for bus, send in ((self.mix,1.),(self.room,room),(self.echo,echo)):
            if not send:
                continue
            bus[start:start+first] += stereo[:first]*send
            if first < len(stereo):
                bus[:len(stereo)-first] += stereo[first:]*send

    def hit(self, beat: float, name: str, vol: float, pan: float = 0., tune: float = 1., room: float = .11):
        accent = self.rng.uniform(.94,1.04)
        self.place(beat,drum(name,self.rng,tune),vol*accent,pan,room)

    def note(self, beat: float, name: str, midi: float, dur: float, vol: float, pan: float = 0., room: float=.12, echo: float=0.):
        self.place(beat,voice(name,midi,dur*self.beat,self.rng),vol,pan,room,echo)

    def chord(self, beat: float, name: str, root: int, intervals: tuple, dur: float, vol: float, spread: float=.38, room: float=.19):
        for i, interval in enumerate(intervals):
            self.note(beat+i*.014,name,root+interval,dur,vol,self.rng.uniform(-spread,spread),room)

    def hats(self, beat: float, step: float, vol: float, swing: float=.0, instrument: str="hat"):
        for i in range(round(4/step)):
            offset = i*step+(swing if i%2 else 0)+self.rng.uniform(-.009,.009)
            self.hit(beat+offset,instrument,vol*(.65 if i%2 else 1),.26,room=.06)

    def finish(self) -> np.ndarray:
        result = self.mix.copy()
        for channel in range(2):
            t = times(.72)
            tail = filt(self.rng.normal(size=len(t)), (350, 5800), "bandpass")*np.exp(-10.1*t)*.049
            for sec, gain in ((.027,.23),(.047,.16),(.071,.11)):
                tail[round((sec+.008*channel)*RATE)] += gain
            wet = signal.fftconvolve(self.room[:,channel],tail,mode="full").astype(np.float32)
            result[:,channel] += wet[:self.frames]
            result[:len(wet)-self.frames,channel] += wet[self.frames:]
        for n in range(1,4):
            delay = round(self.beat*.75*n*RATE)
            result += np.roll(self.echo[:,::(-1 if n%2 else 1)],delay,axis=0) * .30**n
        for c in range(2):
            result[:,c] = filt(result[:,c],25,"highpass")
        # Mild bus saturation, followed by measured constant loudness gain at export.
        scale = .92/max(.01,np.quantile(np.abs(result),.9985))
        result = np.tanh(scale*result)*.96
        fade = round(.005*RATE)
        window = np.linspace(0,1,fade)[:,None]
        result[:fade] *= window
        result[-fade:] *= window[::-1]
        return np.round(result*32767).astype("<i2")


def melody(s: Studio, beat: float, root: int, pattern: tuple, name: str, level:float, pan:float, echo:float=0):
    for offset, step, length in pattern:
        s.note(beat+offset,name,root+step,length,level,pan,.24,echo)


def flash(s: Studio, bar: int):
    b, v, key = bar*4,s.cut.variant,s.cut.key
    progression = ((0,10,5,7),(0,5,-2,3))[v]
    root = key+progression[bar%4]
    minor = bar%4 in ((0,3) if v==0 else (0,2))
    chord = (0,3 if minor else 4,7,10 if minor else 11)
    # Kick and chord slight offsets create audible breathing without volume pumping.
    s.chord(b+.08,"poly",root+12,chord,3.80,.107,.8)
    s.hats(b,.5,.25 if bar%8<4 else .30)
    for step in (0,1,2,3):
        s.hit(b+step,"kick",.80,room=.025)
        if step%2:
            s.hit(b+step+.015,"snare",.54,room=.30)
            s.hit(b+step+.045,"clap",.24,.15,room=.30)
    for i,step in enumerate((.03,.76,1.52,2.05,2.77,3.5)):
        s.note(b+step,"bass",root-12+(12 if i in (3,5) else 0),.52,.48,room=.02)
    arp = (0,7,12,3 if minor else 4,7,14,12,7)
    for i in range(8):
        if bar%8<4 and i%2==0:
            continue
        s.note(b+i*.5+.03,"ep",root+24+arp[(i+v*3)%8],.46,.20,-.36 if i%2 else .32,.15,.65)
    hooks = (
        ((.45,12,.81),(1.48,10,.37),(2.20,7,.65),(3.41,14,.47)),
        ((.02,7,1.10),(1.63,12,.58),(2.79,15,.46),(3.49,14,.34)),
    )
    if bar%4 in (1,3):
        melody(s,b,key+24,hooks[(bar//4+v)%2],"lead",.20,.04,.8)
    if bar%8==7:
        for i in range(3): s.hit(b+3.25+i*.25,"tom",.25+i*.055,.12-i*.15,1.49-i*.18,.26)


def cocoteo(s: Studio, bar: int):
    b,v,key = bar*4,s.cut.variant,s.cut.key
    root = key+((0,5,7,3),(0,3,-2,5))[v][bar%4]
    third = 3 if bar%4 in (0,3) else 4
    # Clave changes sides between cuts. The syncopated piano anticipates the following beat.
    clave = (0,1.5,3) if (bar+v)%2==0 else (1,2)
    for x in clave: s.hit(b+x,"clave",.20,-.33,1.0,.14)
    s.hats(b,.25,.18,.025,"shaker")
    for x in (0,1.75,2.50,3.45): s.hit(b+x,"kick",.67 if x in (0,2.50) else .49,room=.025)
    s.hit(b+1.03,"rim",.44,.08,1.07,.22)
    s.hit(b+3.01,"clap",.41,.02,room=.21)
    for x, tuning,vol in ((.70,.92,.32),(1.50,1.23,.33),(2.27,1.05,.24),(3.48,.78,.46),(3.78,1.21,.31)):
        s.hit(b+x,"conga",vol,.25 if tuning>1 else -.25,tuning,.18)
    for x,interval,length in ((0,-12,.69),(1.45,-5,.46),(2.00,0,.58),(2.78,-12,.44),(3.47,-5,.43)):
        s.note(b+x,"bass",root+interval,length,.47,room=.025)
    for i,x in enumerate(((.5,1.34,2.50,3.18),(.28,1.51,2.24,3.48))[v]):
        intervals = (third,7,12) if i%2 else (0,third,10)
        s.chord(b+x,"piano",root+12,intervals,.46,.21,.55)
    if bar%4 in (1,2) or bar>=12:
        hooks = (((.14,12,.63),(1.53,10,.38),(2.31,7,.78),(3.42,3,.34)),
                 ((.53,7,.50),(1.44,12,.82),(2.75,15,.33),(3.28,10,.53)))
        melody(s,b,key+24,hooks[(bar+v)%2],"brass",.20,-.12,.38)
    if bar%4==3: s.hit(b+3.58,"cowbell",.27,.4,1.15,.19)


def country(s: Studio, bar: int):
    b,v,key = bar*4,s.cut.variant,s.cut.key
    root = key+((0,5,0,7,5,0,7,0),(0,7,9,5,0,5,7,0))[v][bar%8]
    third = 3 if v and bar%8==2 else 4
    for x in (0,2):
        s.hit(b+x,"rockkick",.56,room=.075)
        s.note(b+x,"bass",root-12+(7 if x==2 else 0),.80,.48,room=.04)
    if bar%2: s.note(b+3.52,"bass",root-12+(5 if bar%4==3 else 7),.35,.29,room=.04)
    for x in (1,3): s.hit(b+x+.023,"brush" if v else "snare",.42,.07,1.06,.22)
    s.hats(b,.5,.17,.075,"shaker" if v else "hat")
    strings = (0,7,12,12+third,19)
    for x,level,up in ((0,.19,False),(.76,.105,True),(1.03,.25,False),(1.58,.13,True),(2,.19,False),(3,.24,False),(3.58,.13,True)):
        shape = strings[::-1][:3] if up else strings
        for j,interval in enumerate(shape):
            s.note(b+x+j*.016,"guitar",root+interval,.83 if not up else .44,level,-.45+.04*j,.17)
    licks = (
        ((.12,4,.65),(.86,7,.59),(1.57,9,.39),(2.05,7,.94),(3.48,2,.44)),
        ((.05,12,.94),(1.53,9,.66),(2.36,7,.51),(3.20,4,.64)),
    )
    if bar%2==0 or bar%4==3:
        melody(s,b,key+24,licks[(bar//2+v)%2],"steel" if (bar+v)%3 else "guitar",.37,.35,.38)
    else:
        s.note(b+.52,"steel",root+24+third,1.65,.24,.38,.31,.48)
        s.note(b+2.73,"guitar",root+31,.72,.27,.41,.24)
    if bar%4==3 and not v:
        s.hit(b+3.52,"rim",.22,.18,1.12,.22)


def chamber(s: Studio, bar: int):
    b,v,key = bar*4,s.cut.variant,s.cut.key
    root = key+((0,0,3,-2,0,5,3,1),(0,3,1,-2,0,6,5,3))[v][bar%8]
    rhythms = (
        ((0,.51,False),(.75,.23,True),(1.04,.24,True),(1.51,.36,True),(2,.63,False),(2.77,.22,True),(3.04,.26,True),(3.50,.44,True)),
        ((0,.78,False),(1,.22,True),(1.29,.21,True),(1.63,.29,True),(2,.49,False),(2.78,.22,True),(3.0,.69,False)),
    )
    for i,(x,length,palm) in enumerate(rhythms[(bar+v)%2]):
        offset = 0
        if i==len(rhythms[(bar+v)%2])-1 and bar%4==3: offset = 1 if v else -2
        for pan in (-.74,.74):
            waveform = guitar_amp(root+offset,length*s.beat,s.rng,palm)
            s.place(b+x+s.rng.uniform(0,.019),waveform,.32 if palm else .35,pan,.085)
        s.note(b+x,"bass",root-12+offset,length*.95,.38,room=.019)
        if i%2==0 or bar%4==3:
            s.hit(b+x,"rockkick",.81 if i%2==0 else .60,room=.04)
    for x in (1,3):
        s.hit(b+x+.014,"snare",.69,.03,.91,.30)
    s.hats(b,.5,.30,0,"ride" if bar%8 in (4,5) else "hat")
    if bar%4==0: s.hit(b,"crash",.80,-.52,room=.25)
    if bar%8>=4:
        melody(s,b,key+24,((.02,7,1.77),(2.03,6 if v else 10,1.37),(3.5,3,.46)),"lead",.13,.16,.44)
    if bar%8==7:
        for i in range(4): s.hit(b+3+i*.25,"tom",.44,-.30+.20*i,1.65-i*.2,.27)


def south(s: Studio, bar: int):
    b,v,key = bar*4,s.cut.variant,s.cut.key
    root = key+((0,0,-2,3),(0,-2,-5,-2))[v][bar%4]
    for x,delta,length in ((0,0,1.2),(1.54,0,.47),(2.80,7,.44),(3.37,0,.54)):
        s.note(b+x,"sub",root-12+delta,length,.58,room=.018)
    for x in ((0,.76,1.5,2.76,3.30) if (bar+v)%2 else (0,1.52,2.82,3.55)):
        s.hit(b+x,"kick",.81 if x==0 else .61,room=.02)
    s.hit(b+2.02,"snare",.63,.02,.91,.27)
    s.hit(b+2.044,"clap",.53,-.07,room=.28)
    s.hats(b,.5,.26,.025)
    if bar%2 or bar%4==2:
        for i in range(4):
            s.hit(b+3+.1667*i,"hat",.19+i*.021,(-1)**i*.32,room=.08)
    if bar%4==3: s.hit(b+1.75,"open",.30,.40,room=.13)
    chords = (0,3,7,10) if bar%2==0 else (3,7,10)
    for x in ((.13,2.49) if v else (.12,3.00)):
        s.chord(b+x,"brass" if v else "ep",root+12,chords,1.15,.15,.62)
    hooks = (
        ((.42,12,.65),(1.28,7,.50),(2.52,10,.64),(3.54,3,.34)),
        ((.03,7,.76),(.99,3,.85),(2.53,12,.62),(3.42,14,.39)),
    )
    melody(s,b,key+24,hooks[(bar//2+v)%2],"bell" if not v else "ep",.27,-.10,.79)
    if (bar+v)%4==2: s.note(b+3.7,"bell",root+38,.55,.19,.38,.32,.64)


def afro(s: Studio, bar: int):
    b,v,key = bar*4,s.cut.variant,s.cut.key
    root = key+((0,5,3,-2),(0,-2,5,3))[v][bar%4]
    for x in (0,1,2,3):
        s.hit(b+x,"kick",.62 if x in (0,2) else .49,room=.018)
        s.hit(b+x+.51,"open",.18,.32,room=.09)
    s.hats(b,.25,.19,.034,"shaker")
    for x in (1.03,3.04): s.hit(b+x,"rim",.33,-.17,1.20,.24)
    for i,x in enumerate((.48,1.41,2.24,3.70)):
        if (bar+i)%4!=0: s.hit(b+x,"conga",.27,-.37 if i%2 else .28,.81+.20*(i%3),.22)
    base = root-12
    for x,step,length in (((.73,0,.59),(1.52,7,.40),(2.56,0,.70),(3.5,12,.42)) if (bar+v)%2 else
                            ((.04,0,.69),(1.26,3,.44),(2.70,7,.57),(3.45,0,.51),(3.78,12,.25))):
        s.note(b+x,"log",base+step,length,.59,room=.042)
    chords = (3,7,10,14) if bar%4 in (0,2) else (4,7,11,14)
    for x in ((.54,1.78,3.23) if v else (.50,2.40,3.38)):
        s.chord(b+x,"ep",root+12,chords,.89,.19,.68,.21)
    if bar%4 in (1,3):
        hooks = (((.11,7,.73),(1.39,12,.55),(2.12,14,.86),(3.47,10,.48)),
                 ((.40,10,.72),(1.60,7,.48),(2.83,15,.45),(3.35,12,.63)))
        melody(s,b,key+24,hooks[(bar//4+v)%2],"bell",.19,.19,.71)
    if bar%8>=4:
        s.note(b+.10,"poly",root+19,2.75,.091,-.39,.30,.22)


ARRANGERS: dict[str,Callable[[Studio,int],None]] = {
    "flash-fm":flash, "cocoteo-fm":cocoteo, "back-country":country,
    "the-chamber":chamber, "dirty-south":south, "afro-bank":afro,
}


def run(args: list[str], data: bytes | None=None) -> subprocess.CompletedProcess:
    return subprocess.run(args,input=data,stdout=subprocess.PIPE,stderr=subprocess.PIPE,check=True)


def loudness(inputs: list[str], data: bytes | None=None) -> tuple[float,float]:
    proc = run(["ffmpeg","-hide_banner","-nostats",*inputs,"-af",
                "loudnorm=I=-16:TP=-1.5:LRA=8:print_format=json","-f","null","-"],data)
    log = proc.stderr.decode()
    stats = json.loads(log[log.rindex("{"):log.rindex("}")+1])
    return float(stats["input_i"]), float(stats["input_tp"])


def export(cut: Cut, n: int, audio_dir: Path) -> tuple[dict,tuple]:
    s = Studio(cut,17401+n*127)
    for bar in range(cut.bars):
        ARRANGERS[cut.station](s,bar)
    pcm = s.finish().tobytes()
    raw = ["-f","s16le","-ar",str(RATE),"-ac","2","-i","pipe:0"]
    integrated, _ = loudness(raw,pcm)
    gain = -16-integrated
    track_id = f"{cut.station}-{cut.variant+1}"
    out = audio_dir/f"{track_id}.mp3"
    album = "Leonida FM Original Sessions"
    run(["ffmpeg","-v","error","-y",*raw,"-af",
         f"volume={gain:.3f}dB,alimiter=limit=0.82:attack=5:release=65:level=false:latency=1",
         "-c:a","libmp3lame","-b:a","128k","-id3v2_version","3","-write_xing","1",
         "-metadata",f"title={cut.title}","-metadata",f"artist={ARTIST}",
         "-metadata",f"album={album}","-metadata","comment=Original synthesized community demo",
         str(out)],pcm)
    measurements = inspect_master(out, cut.title)
    row = {
        "id": track_id,
        "title": cut.title,
        "artist": ARTIST,
        "duration": measurements[0],
        "url": f"/audio/{out.name}",
        "rights": "COMMUNITY_ORIGINAL",
    }
    return row, measurements


def inspect_master(path: Path, title: str) -> tuple[float, float, float, int]:
    info = json.loads(run([
        "ffprobe", "-v", "error", "-show_streams", "-show_format",
        "-of", "json", str(path)
    ]).stdout)
    stream = info["streams"][0]
    tags = info["format"]["tags"]
    assert (stream["codec_name"], stream["channels"], stream["sample_rate"]) == ("mp3", 2, str(RATE))
    assert tags["artist"] == ARTIST and tags["title"] == title
    duration = float(info["format"]["duration"])
    integrated, peak = loudness(["-i", str(path)])
    assert 15 <= duration <= 45, (path, duration)
    assert -19 <= integrated <= -14 and peak < -.45, (path, integrated, peak)
    return duration, integrated, peak, path.stat().st_size


def print_measurements(track_id: str, stats: tuple[float, float, float, int]) -> None:
    duration, level, peak, size = stats
    print(f"{track_id:18} {duration:9.5f} s  {level:6.2f} LUFS  {peak:5.2f} dBTP  {size:8} bytes",
          flush=True)


def verify_release(directory: Path, manifest: Path) -> None:
    """Verify published assets and seek into them the way a time-based radio join would."""
    catalog = json.loads(manifest.read_text(encoding="utf-8"))
    expected_ids = {f"{cut.station}-{cut.variant+1}" for cut in CUTS}
    actual_ids = {row["id"] for rows in catalog.values() for row in rows}
    assert actual_ids == expected_ids
    assert set(catalog) == set(ARRANGERS)
    assert all(len(rows) == 2 for rows in catalog.values())
    total = 0
    for cut in CUTS:
        row = catalog[cut.station][cut.variant]
        assert row["title"] == cut.title and row["artist"] == ARTIST
        assert row["url"] == f"/audio/{cut.station}-{cut.variant+1}.mp3"
        assert row["rights"] == "COMMUNITY_ORIGINAL"
        path = directory / Path(row["url"]).name
        stats = inspect_master(path, cut.title)
        assert abs(row["duration"] - stats[0]) <= 0.00001
        for fraction in (.12, .53, .88):
            sample = run([
                "ffmpeg", "-v", "error", "-ss", f"{stats[0] * fraction:.5f}",
                "-i", str(path), "-t", "0.35", "-ac", "2",
                "-ar", "16000", "-f", "f32le", "pipe:1"
            ]).stdout
            block = np.frombuffer(sample, dtype="<f4").reshape(-1, 2)
            assert len(block) >= 5400, (path, fraction, "short seek")
            assert np.sqrt(np.mean(block**2)) > .009, (path, fraction, "silent seek")
            assert np.max(np.abs(block)) < .996, (path, fraction, "clipped seek")
        print_measurements(row["id"], stats)
        total += stats[3]
    assert total < 10_000_000
    print(f"{total:,} bytes verified. 12 complete decodes; 36 mid-program seeks.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--verify", action="store_true", help="Check the existing MP3s and manifest without rendering them.")
    args = parser.parse_args()
    directory = ROOT / "public" / "audio"
    manifest = ROOT / "data" / "programs.json"
    if args.verify:
        verify_release(directory, manifest)
        return
    directory.mkdir(parents=True, exist_ok=True)
    manifest.parent.mkdir(exist_ok=True)
    tracks: dict[str, list] = {}
    total = 0
    # A failed encoder or loudness check must leave the previously published set intact.
    with tempfile.TemporaryDirectory(prefix=".leonida-render-", dir=ROOT.parent) as temp_dir:
        stage = Path(temp_dir)
        for n, cut in enumerate(CUTS, 1):
            row, stats = export(cut, n, stage)
            tracks.setdefault(cut.station, []).append(row)
            total += stats[3]
            print_measurements(row["id"], stats)
        assert sum(map(len, tracks.values())) == 12 and total < 10_000_000
        for path in sorted(stage.glob("*.mp3")):
            path.replace(directory / path.name)
        staged_manifest = stage / "programs.json"
        staged_manifest.write_text(json.dumps(tracks, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        staged_manifest.replace(manifest)
    print(f"{total:,} bytes total")


if __name__ == "__main__":
    main()
