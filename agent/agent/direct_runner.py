"""Direct training runner — executes training script locally without Docker.

Used on cloud GPU instances (Vast.ai, Lambda) where the agent runs directly
on the GPU machine. Handles dependency installation and CUDA detection automatically.
"""

import asyncio
import json
import logging
import os
import subprocess
import tempfile
from typing import Any, Callable, Optional

from agent.config import settings

logger = logging.getLogger(__name__)

# Marker file to indicate deps are installed
DEPS_MARKER = "/workspace/.tunellm-deps-installed"

# Pinned dependency versions (proven working on RTX 3060 + CUDA 12.4)
PINNED_DEPS = {
    "cuda124": "torch==2.5.1 torchvision==0.20.1",
    "cuda121": "torch==2.5.1+cu121 torchvision==0.20.1+cu121 --index-url https://download.pytorch.org/whl/cu121",
    "cuda118": "torch==2.4.0+cu118 torchvision==0.19.0+cu118 --index-url https://download.pytorch.org/whl/cu118",
    "common": (
        "unsloth bitsandbytes>=0.46.1 rouge-score datasets accelerate "
        "trl peft httpx psutil rich pydantic-settings"
    ),
    "post_install_remove": "torchao",  # Remove incompatible torchao if pulled in
}


class DirectRunner:
    """Run training scripts directly as subprocesses with auto dependency management."""

    def __init__(self):
        self.running_processes: dict[int, asyncio.subprocess.Process] = {}
        self._deps_checked = False

    def _detect_cuda_version(self) -> str:
        """Detect CUDA version from nvidia-smi."""
        try:
            result = subprocess.run(
                ["nvidia-smi", "--query-gpu=driver_version", "--format=csv,noheader"],
                capture_output=True, text=True, timeout=10,
            )
            if result.returncode == 0:
                # Also check CUDA toolkit version
                result2 = subprocess.run(
                    ["nvidia-smi"], capture_output=True, text=True, timeout=10,
                )
                output = result2.stdout
                # Parse "CUDA Version: 12.4" from nvidia-smi output
                for line in output.split("\n"):
                    if "CUDA Version" in line:
                        parts = line.split("CUDA Version:")
                        if len(parts) > 1:
                            version = parts[1].strip().split()[0]
                            major_minor = version.split(".")
                            major = int(major_minor[0])
                            minor = int(major_minor[1]) if len(major_minor) > 1 else 0
                            if major >= 12 and minor >= 4:
                                return "cuda124"
                            elif major >= 12:
                                return "cuda121"
                            else:
                                return "cuda118"
        except Exception as e:
            logger.warning(f"CUDA detection failed: {e}")
        return "cuda124"  # Default assumption

    async def _ensure_dependencies(self, on_progress: Optional[Callable] = None) -> bool:
        """Ensure training dependencies are installed. Returns True if installation ran."""
        if self._deps_checked and os.path.exists(DEPS_MARKER):
            return False

        # Quick check: can we import unsloth?
        try:
            result = subprocess.run(
                [settings.python_executable, "-c", "from unsloth import FastLanguageModel; print('ok')"],
                capture_output=True, text=True, timeout=30,
            )
            if result.returncode == 0 and "ok" in result.stdout:
                self._deps_checked = True
                # Create marker
                try:
                    open(DEPS_MARKER, "w").close()
                except OSError:
                    pass
                return False
        except Exception:
            pass

        # Need to install
        logger.info("Installing training dependencies...")
        if on_progress:
            await on_progress("__PHASE__:installing_deps")

        cuda_ver = self._detect_cuda_version()
        logger.info(f"Detected CUDA: {cuda_ver}")

        # Install torch first (CUDA-specific)
        torch_cmd = f"pip install -q {PINNED_DEPS[cuda_ver]}"
        logger.info(f"Installing torch: {torch_cmd}")
        proc = await asyncio.create_subprocess_shell(
            torch_cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        stdout, _ = await proc.communicate()
        if on_progress:
            for line in stdout.decode().strip().split("\n")[-3:]:
                if line.strip():
                    await on_progress(f"[deps] {line.strip()}")

        # Install common deps
        common_cmd = f"pip install -q {PINNED_DEPS['common']}"
        logger.info(f"Installing common deps...")
        proc = await asyncio.create_subprocess_shell(
            common_cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        stdout, _ = await proc.communicate()
        if on_progress:
            for line in stdout.decode().strip().split("\n")[-3:]:
                if line.strip():
                    await on_progress(f"[deps] {line.strip()}")

        # Remove incompatible torchao if present
        remove_cmd = f"pip uninstall -y {PINNED_DEPS['post_install_remove']}"
        proc = await asyncio.create_subprocess_shell(
            remove_cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        await proc.communicate()

        # Verify
        result = subprocess.run(
            [settings.python_executable, "-c", "from unsloth import FastLanguageModel; print('ok')"],
            capture_output=True, text=True, timeout=60,
        )
        if result.returncode == 0 and "ok" in result.stdout:
            self._deps_checked = True
            try:
                open(DEPS_MARKER, "w").close()
            except OSError:
                pass
            logger.info("Dependencies installed successfully")
            return True
        else:
            logger.error(f"Dependency installation failed: {result.stderr}")
            if on_progress:
                await on_progress(f"[deps] ERROR: {result.stderr[:200]}")
            return True

    async def run_training_job(
        self,
        job_id: int,
        config: dict[str, Any],
        on_log: Optional[Callable] = None,
    ) -> dict:
        """Run a training job as a local subprocess."""
        # Ensure dependencies before starting
        await self._ensure_dependencies(on_progress=on_log)

        # Write config to temp file
        config_file = tempfile.NamedTemporaryFile(
            mode="w", suffix=".json", prefix=f"tunellm_job_{job_id}_",
            delete=False, dir="/tmp",
        )
        json.dump(config, config_file)
        config_file.close()

        # Set environment
        env = os.environ.copy()
        env["JOB_CONFIG"] = json.dumps(config)
        env["JOB_ID"] = str(job_id)
        if config.get("hf_token"):
            env["HF_TOKEN"] = config["hf_token"]

        # Find training script
        script_path = settings.training_script
        if not os.path.exists(script_path):
            candidates = [
                "/workspace/tunellm-agent/train_unsloth.py",
                "/workspace/train_unsloth.py",
                "/app/train_unsloth.py",
                os.path.join(os.path.dirname(__file__), "..", "..", "training", "scripts", "train_unsloth.py"),
            ]
            for c in candidates:
                if os.path.exists(c):
                    script_path = c
                    break

        if not os.path.exists(script_path):
            return {"status_code": 1, "logs": f"Training script not found: {script_path}"}

        command = [settings.python_executable, script_path, "--config", config_file.name]
        logger.info(f"Starting training job {job_id}: {' '.join(command)}")

        # Launch subprocess
        process = await asyncio.create_subprocess_exec(
            *command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            env=env,
        )

        self.running_processes[job_id] = process

        # Stream output
        all_logs = []
        try:
            while True:
                line = await asyncio.wait_for(
                    process.stdout.readline(), timeout=600,
                )
                if not line:
                    break
                text = line.decode("utf-8", errors="replace").rstrip()
                if text:
                    all_logs.append(text)
                    if on_log:
                        await on_log(text)
        except asyncio.TimeoutError:
            logger.warning(f"Job {job_id}: no output for 10 minutes, killing")
            process.kill()
        except Exception as e:
            logger.error(f"Job {job_id}: error reading output: {e}")

        try:
            await asyncio.wait_for(process.wait(), timeout=30)
        except asyncio.TimeoutError:
            process.kill()
            await process.wait()

        exit_code = process.returncode or 0
        self.running_processes.pop(job_id, None)

        try:
            os.unlink(config_file.name)
        except OSError:
            pass

        return {"status_code": exit_code, "logs": "\n".join(all_logs)}

    async def stop_job(self, job_id: int) -> bool:
        """Stop a running training job."""
        process = self.running_processes.get(job_id)
        if not process:
            return False
        try:
            process.terminate()
            await asyncio.wait_for(process.wait(), timeout=10)
        except asyncio.TimeoutError:
            process.kill()
            await process.wait()
        self.running_processes.pop(job_id, None)
        return True
