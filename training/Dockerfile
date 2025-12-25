# Training Container Dockerfile
# CUDA-enabled container for LLM fine-tuning

FROM nvidia/cuda:12.1.0-devel-ubuntu22.04

# Set environment variables
ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

# Set CUDA environment
ENV CUDA_HOME=/usr/local/cuda
ENV PATH=${CUDA_HOME}/bin:${PATH}
ENV LD_LIBRARY_PATH=${CUDA_HOME}/lib64:${LD_LIBRARY_PATH}

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    python3.11 \
    python3.11-dev \
    python3.11-venv \
    python3-pip \
    git \
    wget \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create symlinks for python
RUN ln -sf /usr/bin/python3.11 /usr/bin/python3 && \
    ln -sf /usr/bin/python3.11 /usr/bin/python

# Upgrade pip
RUN python -m pip install --upgrade pip setuptools wheel

# Install PyTorch with CUDA support
RUN pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121

# Copy requirements and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install flash-attention (optional, requires compilation)
RUN pip install flash-attn --no-build-isolation || echo "Flash attention not installed"

# Copy training scripts
COPY scripts/ /app/scripts/
COPY configs/ /app/configs/

# Set working directory for scripts
WORKDIR /app/scripts

# Default command (can be overridden)
ENTRYPOINT ["python", "train.py"]
CMD ["--config", "/config/config.yaml", "--output-dir", "/models"]

# Labels
LABEL maintainer="TuneLLM"
LABEL description="LLM Fine-tuning Container with CUDA support"
LABEL version="1.0"
