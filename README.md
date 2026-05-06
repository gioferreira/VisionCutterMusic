# VisionCutter — gioferreira's fork

> **Fork of [lovisdotio/VisionCutterMusic](https://github.com/lovisdotio/VisionCutterMusic)**

AI-powered music video generator. Upload a track, pick a visual style and story template, generate synchronized images and videos, export as a complete music video.

---

## Why this fork / Por que este fork

**EN** — The original project relies exclusively on [FAL.ai](https://fal.ai) for AI generation, which incurs a cost per image/video. This fork adds support for **ComfyUI as a local backend**, allowing fully offline, zero-cost generation on your own hardware. It also introduces additional export options and workflow customization.

**PT-BR** — O projeto original depende exclusivamente da [FAL.ai](https://fal.ai) para geração de imagens e vídeos, o que tem custo por geração. Este fork adiciona suporte ao **ComfyUI como backend local**, permitindo geração completamente offline e sem custo rodando no seu próprio hardware. Também inclui opções adicionais de exportação e customização de workflows.

---

## What's different / O que mudou

### 🖥️ ComfyUI local backend
**EN** — Run image and video generation entirely on your own machine using ComfyUI. No API key or per-generation cost required.  
**PT-BR** — Rode geração de imagens e vídeos direto na sua máquina usando ComfyUI. Sem chave de API ou custo por geração.

### 🤖 Multi-model support (ComfyUI)
**EN** — Choose between multiple models for image (flux-klein, z-image) and video (LTX-2 at 25fps, Wan2.2 at 16fps) generation.  
**PT-BR** — Escolha entre múltiplos modelos para imagem (flux-klein, z-image) e vídeo (LTX-2 a 25fps, Wan2.2 a 16fps).

### 🔧 BYOW — Bring Your Own Workflow
**EN** — Upload custom ComfyUI workflows (JSON) for image and video generation. Full control over the generation pipeline.  
**PT-BR** — Carregue workflows customizados do ComfyUI (JSON) para imagem e vídeo. Controle total sobre o pipeline de geração.

### 🎬 Frame strategy control
**EN** — Configure how frames are handled during ComfyUI video generation.  
**PT-BR** — Configure como os frames são tratados durante a geração de vídeo pelo ComfyUI.

### ✂️ Clip fitting modes
**EN** — Export options: stretch, crop from head, crop from tail, or crop from center to fit the beat duration.  
**PT-BR** — Opções de exportação: stretch, crop do início, do final ou do centro para encaixar na duração do beat.

### 🥁 Beat sync _(in progress / em desenvolvimento)_
**EN** — Per-beat scene duration using Essentia.js beat tracking. Currently under active development — may be unstable.  
**PT-BR** — Duração de cena por beat usando rastreamento de beats com Essentia.js. Em desenvolvimento ativo — pode ser instável.

---

## Setup

```bash
npm install
npm run dev
```

Open http://localhost:3000

### FAL.ai (cloud)

Requires a FAL.ai API key. Get one at https://fal.ai

- Image: $0.02 each
- Video (1s): $0.052 each

### ComfyUI (local / free)

1. Install and run [ComfyUI](https://github.com/comfyanonymous/ComfyUI)
2. In the app, switch the backend to **ComfyUI** in the Audio step
3. Enter your local ComfyUI address (default: `http://127.0.0.1:8188`)
4. Select your preferred models and generate for free

---

## Features (original)

- BPM detection and beat synchronization
- 16 visual style presets (Cyberpunk, Anime, Film Noir, Pixel Art, etc.)
- 22 story templates including 6 epic 30-scene templates
- AI image generation via xAI Grok Imagine
- AI video generation via xAI Grok Imagine Video
- Pool-based concurrent generation (5 simultaneous tasks)
- Aspect ratio selection (16:9, 1:1, 9:16)
- FFmpeg-based video export in browser
- Drag and drop scene reordering

## Tech Stack

- Next.js 14
- Zustand
- FAL.ai API / ComfyUI
- FFmpeg.wasm
- Tailwind CSS
- Essentia.js (beat tracking)
