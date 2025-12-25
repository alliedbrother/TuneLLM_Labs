"""TuneLLM Inference Server - Main Entry Point."""

import asyncio
import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator, List, Optional

import uvicorn
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from rich.console import Console
from rich.logging import RichHandler
from sse_starlette.sse import EventSourceResponse

from server.config import settings
from server.generator import GenerationConfig, TextGenerator
from server.model_loader import ModelLoader

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(message)s",
    handlers=[RichHandler(rich_tracebacks=True)],
)
logger = logging.getLogger(__name__)
console = Console()

# Global model instances
model_loader: Optional[ModelLoader] = None
generator: Optional[TextGenerator] = None


# Request/Response schemas
class GenerateRequest(BaseModel):
    """Request schema for text generation."""

    prompt: str = Field(..., description="Input prompt for generation")
    max_new_tokens: int = Field(default=512, ge=1, le=4096)
    temperature: float = Field(default=0.7, ge=0.0, le=2.0)
    top_p: float = Field(default=0.9, ge=0.0, le=1.0)
    top_k: int = Field(default=50, ge=0)
    repetition_penalty: float = Field(default=1.1, ge=1.0, le=2.0)
    do_sample: bool = Field(default=True)
    stop_sequences: Optional[List[str]] = Field(default=None)
    stream: bool = Field(default=False, description="Enable streaming response")


class GenerateResponse(BaseModel):
    """Response schema for text generation."""

    generated_text: str
    prompt_tokens: int
    generated_tokens: int
    model: str


class BatchGenerateRequest(BaseModel):
    """Request schema for batch generation."""

    prompts: List[str] = Field(..., min_length=1, max_length=32)
    max_new_tokens: int = Field(default=512, ge=1, le=4096)
    temperature: float = Field(default=0.7, ge=0.0, le=2.0)
    top_p: float = Field(default=0.9, ge=0.0, le=1.0)
    top_k: int = Field(default=50, ge=0)
    repetition_penalty: float = Field(default=1.1, ge=1.0, le=2.0)
    do_sample: bool = Field(default=True)


class BatchGenerateResponse(BaseModel):
    """Response schema for batch generation."""

    results: List[GenerateResponse]


class HealthResponse(BaseModel):
    """Health check response."""

    status: str
    model_loaded: bool
    model_info: Optional[dict] = None


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Application lifespan manager."""
    global model_loader, generator

    console.print("[bold blue]TuneLLM Inference Server[/bold blue]")

    # Load model if path is configured
    if settings.model_path or settings.base_model:
        try:
            model_loader = ModelLoader(
                model_path=settings.model_path,
                base_model=settings.base_model,
                adapter_path=settings.adapter_path,
                quantization=settings.quantization,
                device_map=settings.device_map,
                torch_dtype=settings.torch_dtype,
            )
            model, tokenizer = model_loader.load()
            generator = TextGenerator(model, tokenizer)
            console.print("[green]Model loaded successfully![/green]")
        except Exception as e:
            logger.exception(f"Failed to load model: {e}")
            console.print(f"[red]Failed to load model: {e}[/red]")
    else:
        console.print("[yellow]No model path configured. Set INFERENCE_MODEL_PATH.[/yellow]")

    yield

    # Cleanup
    if model_loader:
        model_loader.unload()
    console.print("[yellow]Inference server stopped[/yellow]")


# Create FastAPI app
app = FastAPI(
    title="TuneLLM Inference Server",
    description="API for serving fine-tuned LLM models",
    version="0.1.0",
    lifespan=lifespan,
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint."""
    model_info = None
    if model_loader:
        model_info = model_loader.get_model_info()

    return HealthResponse(
        status="healthy",
        model_loaded=generator is not None,
        model_info=model_info,
    )


@app.post("/generate", response_model=GenerateResponse)
async def generate(request: GenerateRequest):
    """Generate text from a prompt."""
    if generator is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    config = GenerationConfig(
        max_new_tokens=request.max_new_tokens,
        temperature=request.temperature,
        top_p=request.top_p,
        top_k=request.top_k,
        repetition_penalty=request.repetition_penalty,
        do_sample=request.do_sample,
        stop_sequences=request.stop_sequences,
    )

    # Handle streaming
    if request.stream:
        return await generate_stream(request.prompt, config)

    # Non-streaming generation
    try:
        generated_text = generator.generate(request.prompt, config)

        # Count tokens
        prompt_tokens = len(generator.tokenizer.encode(request.prompt))
        generated_tokens = len(generator.tokenizer.encode(generated_text))

        return GenerateResponse(
            generated_text=generated_text,
            prompt_tokens=prompt_tokens,
            generated_tokens=generated_tokens,
            model=settings.model_path or settings.base_model,
        )
    except Exception as e:
        logger.exception(f"Generation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


async def generate_stream(prompt: str, config: GenerationConfig):
    """Generate text with Server-Sent Events streaming."""

    async def event_generator():
        try:
            async for token in generator.generate_stream(prompt, config):
                yield {"data": token}
            yield {"data": "[DONE]"}
        except Exception as e:
            logger.exception(f"Streaming generation failed: {e}")
            yield {"data": f"[ERROR] {str(e)}"}

    return EventSourceResponse(event_generator())


@app.post("/generate/batch", response_model=BatchGenerateResponse)
async def batch_generate(request: BatchGenerateRequest):
    """Generate text for multiple prompts."""
    if generator is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    if len(request.prompts) > settings.max_batch_size:
        raise HTTPException(
            status_code=400,
            detail=f"Batch size exceeds maximum of {settings.max_batch_size}",
        )

    config = GenerationConfig(
        max_new_tokens=request.max_new_tokens,
        temperature=request.temperature,
        top_p=request.top_p,
        top_k=request.top_k,
        repetition_penalty=request.repetition_penalty,
        do_sample=request.do_sample,
    )

    try:
        generated_texts = generator.batch_generate(request.prompts, config)

        results = []
        for prompt, generated_text in zip(request.prompts, generated_texts):
            prompt_tokens = len(generator.tokenizer.encode(prompt))
            generated_tokens = len(generator.tokenizer.encode(generated_text))

            results.append(
                GenerateResponse(
                    generated_text=generated_text,
                    prompt_tokens=prompt_tokens,
                    generated_tokens=generated_tokens,
                    model=settings.model_path or settings.base_model,
                )
            )

        return BatchGenerateResponse(results=results)
    except Exception as e:
        logger.exception(f"Batch generation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/load")
async def load_model(
    model_path: str,
    base_model: Optional[str] = None,
    adapter_path: Optional[str] = None,
    quantization: Optional[str] = None,
):
    """Load a new model dynamically."""
    global model_loader, generator

    # Unload existing model
    if model_loader:
        model_loader.unload()

    try:
        model_loader = ModelLoader(
            model_path=model_path,
            base_model=base_model,
            adapter_path=adapter_path,
            quantization=quantization,
        )
        model, tokenizer = model_loader.load()
        generator = TextGenerator(model, tokenizer)

        return {"status": "success", "model_info": model_loader.get_model_info()}
    except Exception as e:
        logger.exception(f"Failed to load model: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/unload")
async def unload_model():
    """Unload the current model."""
    global model_loader, generator

    if model_loader:
        model_loader.unload()
        model_loader = None
        generator = None

    return {"status": "success", "message": "Model unloaded"}


def main():
    """Run the inference server."""
    uvicorn.run(
        "server.main:app",
        host=settings.host,
        port=settings.port,
        workers=settings.workers,
        reload=False,
    )


if __name__ == "__main__":
    main()
