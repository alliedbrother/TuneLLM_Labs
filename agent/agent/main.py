"""TuneLLM Node Agent - Main Entry Point."""

import asyncio
import logging
import signal
import sys
from typing import Optional

import click
import psutil
from rich.console import Console
from rich.logging import RichHandler

from agent.api_client import APIClient
from agent.config import settings
from agent.docker_runner import DockerRunner
from agent.job_handler import JobHandler

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(message)s",
    handlers=[RichHandler(rich_tracebacks=True)],
)
logger = logging.getLogger(__name__)
console = Console()


def get_gpu_info() -> dict:
    """Get GPU information using pynvml."""
    try:
        import pynvml

        pynvml.nvmlInit()
        device_count = pynvml.nvmlDeviceGetCount()

        if device_count == 0:
            return {"gpu_count": 0}

        handle = pynvml.nvmlDeviceGetHandleByIndex(0)
        name = pynvml.nvmlDeviceGetName(handle)
        memory = pynvml.nvmlDeviceGetMemoryInfo(handle)
        utilization = pynvml.nvmlDeviceGetUtilizationRates(handle)

        return {
            "gpu_count": device_count,
            "gpu_type": name if isinstance(name, str) else name.decode(),
            "gpu_memory_gb": memory.total / (1024**3),
            "gpu_utilization": utilization.gpu,
            "memory_utilization": (memory.used / memory.total) * 100,
        }
    except Exception as e:
        logger.warning(f"Failed to get GPU info: {e}")
        return {"gpu_count": 0}


def get_system_stats() -> dict:
    """Get system statistics."""
    gpu_info = get_gpu_info()

    return {
        **gpu_info,
        "cpu_count": psutil.cpu_count(),
        "ram_gb": psutil.virtual_memory().total / (1024**3),
        "disk_gb": psutil.disk_usage("/").total / (1024**3),
    }


class Agent:
    """TuneLLM Node Agent."""

    def __init__(
        self,
        server_url: str,
        api_key: Optional[str],
        node_name: str,
    ):
        self.server_url = server_url
        self.api_key = api_key
        self.node_name = node_name
        self.node_id: Optional[int] = None
        self.running = False

        self.api_client = APIClient(server_url, api_key)
        self.docker_runner = DockerRunner()
        self.job_handler = JobHandler(self.api_client, self.docker_runner)

    async def start(self):
        """Start the agent."""
        console.print("[bold blue]TuneLLM Agent v0.1.0[/bold blue]")
        console.print(f"Connecting to: {self.server_url}")

        await self.api_client.connect()

        # Register node if no API key
        if not self.api_key:
            console.print("Registering new node...")
            result = await self.api_client.register_node(self.node_name)
            self.node_id = result["node_id"]
            self.api_key = result["api_key"]
            console.print(f"[green]Registered as node {self.node_id}[/green]")
            console.print(f"[yellow]API Key: {self.api_key}[/yellow]")
            console.print("[yellow]Save this API key for future runs![/yellow]")
        else:
            # Get node ID from heartbeat
            stats = get_system_stats()
            # TODO: Get node ID from API
            self.node_id = 1

        self.running = True
        console.print(f"[green]Agent started. Node ID: {self.node_id}[/green]")

        # Start main loop
        await asyncio.gather(
            self._heartbeat_loop(),
            self._job_poll_loop(),
        )

    async def stop(self):
        """Stop the agent."""
        self.running = False
        await self.api_client.disconnect()
        console.print("[yellow]Agent stopped[/yellow]")

    async def _heartbeat_loop(self):
        """Send periodic heartbeats to the server."""
        while self.running:
            try:
                stats = get_system_stats()
                await self.api_client.send_heartbeat(self.node_id, stats)
                logger.debug(f"Heartbeat sent: {stats}")
            except Exception as e:
                logger.warning(f"Heartbeat failed: {e}")

            await asyncio.sleep(settings.heartbeat_interval)

    async def _job_poll_loop(self):
        """Poll for new jobs to execute."""
        while self.running:
            try:
                if not self.job_handler.get_current_job():
                    jobs = await self.api_client.get_pending_jobs(self.node_id)
                    if jobs:
                        job = jobs[0]  # Take first pending job
                        console.print(f"[cyan]Starting job: {job['name']}[/cyan]")
                        await self.job_handler.execute_job(job)
            except Exception as e:
                logger.warning(f"Job poll failed: {e}")

            await asyncio.sleep(5)  # Poll every 5 seconds


@click.command()
@click.option(
    "--server-url",
    default=settings.server_url,
    help="Control plane server URL",
)
@click.option(
    "--api-key",
    default=settings.api_key,
    help="Node API key (optional for first run)",
)
@click.option(
    "--node-name",
    default=settings.node_name,
    help="Name for this node",
)
def main(server_url: str, api_key: Optional[str], node_name: str):
    """Run the TuneLLM node agent."""
    agent = Agent(server_url, api_key, node_name)

    # Handle signals
    def signal_handler(sig, frame):
        console.print("\n[yellow]Shutting down...[/yellow]")
        asyncio.create_task(agent.stop())
        sys.exit(0)

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    # Run the agent
    try:
        asyncio.run(agent.start())
    except KeyboardInterrupt:
        console.print("\n[yellow]Agent stopped[/yellow]")


if __name__ == "__main__":
    main()
