"""Cloud GPU provisioning router — multi-provider with user-managed API keys."""

import logging
import secrets
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.cloud_credential import CloudCredential
from app.models.node import Node, NodeStatus
from app.models.user import User
from app.services.auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter()

SUPPORTED_PROVIDERS = ["vastai", "lambda", "aws"]


# --- Schemas ---

class CloudCredentialCreate(BaseModel):
    provider: str = Field(..., pattern="^(vastai|lambda|aws|anthropic|openai)$")
    api_key: str = Field(..., min_length=1)
    extra_data: Optional[str] = None  # AWS secret key, region, etc.
    label: Optional[str] = None
    backend_url: Optional[str] = None  # How remote GPUs reach this server


class CloudCredentialResponse(BaseModel):
    id: int
    provider: str
    label: Optional[str]
    api_key_preview: str  # masked
    backend_url: Optional[str] = None
    created_at: str
    updated_at: str

    model_config = {"from_attributes": True}


class CloudCredentialUpdate(BaseModel):
    api_key: Optional[str] = None
    extra_data: Optional[str] = None
    label: Optional[str] = None
    backend_url: Optional[str] = None


class DetectedGPU(BaseModel):
    provider: str
    instance_id: str
    name: str = "unnamed"
    status: str = "unknown"
    gpu_type: str = "Unknown"
    gpu_count: int = 1
    gpu_ram_gb: float = 0
    ip_address: Optional[str] = None
    ssh_port: Optional[int] = None
    region: Optional[str] = None
    disk_gb: Optional[float] = None
    price_per_hour: Optional[float] = None


class ProviderInfo(BaseModel):
    id: str
    name: str
    description: str
    requires_extra: bool = False
    extra_label: Optional[str] = None
    is_gpu_provider: bool = True


# --- Helper ---

def _mask_key(key: str) -> str:
    if len(key) <= 8:
        return "****"
    return key[:4] + "****" + key[-4:]


# --- Credential Management ---

@router.get("/cloud/providers", response_model=list[ProviderInfo])
async def list_providers(
    current_user: User = Depends(get_current_user),
) -> list[dict]:
    """List supported cloud GPU providers."""
    return [
        {
            "id": "vastai",
            "name": "Vast.ai",
            "description": "GPU marketplace with affordable on-demand pricing",
            "requires_extra": False,
            "is_gpu_provider": True,
        },
        {
            "id": "lambda",
            "name": "Lambda Labs",
            "description": "Cloud GPUs for AI — A100, H100 instances",
            "requires_extra": False,
            "is_gpu_provider": True,
        },
        {
            "id": "aws",
            "name": "Amazon Web Services",
            "description": "EC2 GPU instances (p3, g4dn, g5, g6)",
            "requires_extra": True,
            "extra_label": "Secret Access Key",
            "is_gpu_provider": True,
        },
        {
            "id": "anthropic",
            "name": "Anthropic (Claude)",
            "description": "API key for Q&A generation from PDFs",
            "requires_extra": False,
            "is_gpu_provider": False,
        },
        {
            "id": "openai",
            "name": "OpenAI (GPT)",
            "description": "API key for Q&A generation from PDFs",
            "requires_extra": False,
            "is_gpu_provider": False,
        },
    ]


@router.post("/cloud/credentials", response_model=CloudCredentialResponse)
async def save_credential(
    data: CloudCredentialCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Save or update a cloud provider API key."""
    # Check if credential already exists for this provider
    result = await db.execute(
        select(CloudCredential).where(
            CloudCredential.user_id == current_user.id,
            CloudCredential.provider == data.provider,
        )
    )
    existing = result.scalar_one_or_none()

    if existing:
        existing.api_key = data.api_key
        if data.extra_data is not None:
            existing.extra_data = data.extra_data
        if data.label is not None:
            existing.label = data.label
        if data.backend_url is not None:
            existing.backend_url = data.backend_url
        await db.flush()
        await db.refresh(existing)
        cred = existing
    else:
        cred = CloudCredential(
            user_id=current_user.id,
            provider=data.provider,
            api_key=data.api_key,
            extra_data=data.extra_data,
            label=data.label or data.provider,
            backend_url=data.backend_url,
        )
        db.add(cred)
        await db.flush()
        await db.refresh(cred)

    return {
        "id": cred.id,
        "provider": cred.provider,
        "label": cred.label,
        "api_key_preview": _mask_key(cred.api_key),
        "backend_url": cred.backend_url,
        "created_at": str(cred.created_at),
        "updated_at": str(cred.updated_at),
    }


@router.get("/cloud/credentials", response_model=list[CloudCredentialResponse])
async def list_credentials(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[dict]:
    """List saved cloud credentials (keys are masked)."""
    result = await db.execute(
        select(CloudCredential).where(CloudCredential.user_id == current_user.id)
    )
    creds = result.scalars().all()
    return [
        {
            "id": c.id,
            "provider": c.provider,
            "label": c.label,
            "api_key_preview": _mask_key(c.api_key),
            "backend_url": c.backend_url,
            "created_at": str(c.created_at),
            "updated_at": str(c.updated_at),
        }
        for c in creds
    ]


@router.put("/cloud/credentials/{cred_id}", response_model=CloudCredentialResponse)
async def update_credential(
    cred_id: int,
    data: CloudCredentialUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Update a cloud credential (change API key)."""
    result = await db.execute(
        select(CloudCredential).where(
            CloudCredential.id == cred_id,
            CloudCredential.user_id == current_user.id,
        )
    )
    cred = result.scalar_one_or_none()
    if not cred:
        raise HTTPException(status_code=404, detail="Credential not found")

    if data.api_key is not None:
        cred.api_key = data.api_key
    if data.extra_data is not None:
        cred.extra_data = data.extra_data
    if data.label is not None:
        cred.label = data.label
    if data.backend_url is not None:
        cred.backend_url = data.backend_url

    await db.flush()
    await db.refresh(cred)

    return {
        "id": cred.id,
        "provider": cred.provider,
        "label": cred.label,
        "api_key_preview": _mask_key(cred.api_key),
        "backend_url": cred.backend_url,
        "created_at": str(cred.created_at),
        "updated_at": str(cred.updated_at),
    }


@router.delete("/cloud/credentials/{cred_id}", status_code=204)
async def delete_credential(
    cred_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    """Delete a cloud credential."""
    result = await db.execute(
        select(CloudCredential).where(
            CloudCredential.id == cred_id,
            CloudCredential.user_id == current_user.id,
        )
    )
    cred = result.scalar_one_or_none()
    if not cred:
        raise HTTPException(status_code=404, detail="Credential not found")
    await db.delete(cred)


# --- GPU Detection ---

async def _get_user_credential(
    provider: str, user_id: int, db: AsyncSession
) -> CloudCredential:
    """Get user's credential for a provider, or raise 400."""
    result = await db.execute(
        select(CloudCredential).where(
            CloudCredential.user_id == user_id,
            CloudCredential.provider == provider,
        )
    )
    cred = result.scalar_one_or_none()
    if not cred:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"No API key configured for {provider}. Add one in Settings.",
        )
    return cred


@router.get("/cloud/detect-gpus/{provider}", response_model=list[DetectedGPU])
async def detect_gpus(
    provider: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[dict]:
    """Detect existing GPU instances from a cloud provider using the user's API key."""
    if provider not in SUPPORTED_PROVIDERS:
        raise HTTPException(status_code=400, detail=f"Unsupported provider: {provider}")

    cred = await _get_user_credential(provider, current_user.id, db)

    try:
        if provider == "vastai":
            from app.services.vastai_provider import VastAIProvider
            p = VastAIProvider(cred.api_key)
            # List user's existing rented instances
            import httpx
            async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
                resp = await client.get(
                    "https://console.vast.ai/api/v0/instances/",
                    params={"owner": "me"},
                    headers={"Authorization": f"Bearer {cred.api_key}"},
                )
                resp.raise_for_status()
                data = resp.json()
                instances = data.get("instances", []) if isinstance(data, dict) else data
                return [
                    {
                        "provider": "vastai",
                        "instance_id": str(inst.get("id", "")),
                        "name": inst.get("label") or f"vast-{inst.get('id', 'unknown')}",
                        "status": inst.get("actual_status") or inst.get("status_msg") or "unknown",
                        "gpu_type": inst.get("gpu_name") or "Unknown",
                        "gpu_count": inst.get("num_gpus") or 1,
                        "gpu_ram_gb": round(inst.get("gpu_ram", 0) / 1024, 1)
                        if (inst.get("gpu_ram") or 0) > 100
                        else (inst.get("gpu_ram") or 0),
                        "ip_address": inst.get("ssh_host"),
                        "ssh_port": inst.get("ssh_port"),
                        "disk_gb": round(inst.get("disk_space") or 0, 0),
                        "price_per_hour": inst.get("dph_total"),
                    }
                    for inst in instances
                ]

        elif provider == "lambda":
            from app.services.lambda_provider import LambdaProvider
            p = LambdaProvider(cred.api_key)
            instances = await p.list_instances()
            return [
                {
                    "provider": "lambda",
                    "instance_id": inst["id"],
                    "name": inst.get("name", f"lambda-{inst['id'][:8]}"),
                    "status": inst.get("status", "unknown"),
                    "gpu_type": inst.get("gpu_type", "Unknown"),
                    "gpu_count": inst.get("gpu_count", 1),
                    "ip_address": inst.get("ip_address"),
                    "region": inst.get("region"),
                }
                for inst in instances
            ]

        elif provider == "aws":
            from app.services.aws_provider import AWSProvider
            region = cred.extra_data or "us-east-1"
            p = AWSProvider(cred.api_key, cred.extra_data.split("|")[0] if "|" in (cred.extra_data or "") else "", region)
            instances = await p.list_instances()
            return [
                {
                    "provider": "aws",
                    "instance_id": inst["id"],
                    "name": inst.get("name", inst["id"]),
                    "status": inst.get("status", "unknown"),
                    "gpu_type": inst.get("gpu_type", "Unknown"),
                    "gpu_count": inst.get("gpu_count", 0),
                    "gpu_ram_gb": inst.get("gpu_ram_gb", 0),
                    "ip_address": inst.get("ip_address"),
                    "region": inst.get("region"),
                }
                for inst in instances
            ]

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to detect GPUs from {provider}: {str(e)}",
        )

    return []


# --- Connect to a detected instance ---

class ConnectRequest(BaseModel):
    provider: str = Field(..., pattern="^(vastai|lambda|aws)$")
    instance_id: str
    name: Optional[str] = None
    gpu_type: Optional[str] = None
    gpu_count: int = 1
    gpu_ram_gb: float = 0
    ssh_host: Optional[str] = None
    ssh_port: Optional[int] = None


async def _connect_background(
    provider: str, instance_id: str, ssh_host: str, ssh_port: int,
    agent_api_key: str, vastai_api_key: str,
):
    """Background task: set up tunnel and deploy agent. Updates node status when done."""
    from app.services.ssh_connector import (
        get_or_create_ssh_key, upload_ssh_key_to_vastai,
        start_reverse_tunnel, deploy_agent_via_ssh, stop_tunnel,
    )

    try:
        # Step 1: Upload SSH key
        if provider == "vastai":
            _, pub_key = get_or_create_ssh_key()
            await upload_ssh_key_to_vastai(vastai_api_key, pub_key)

        # Step 2: Tunnel
        tunnel_ok = await start_reverse_tunnel(
            ssh_host=ssh_host, ssh_port=ssh_port,
            local_port=8000, remote_port=8000,
            instance_id=instance_id,
        )
        if not tunnel_ok:
            logger.error(f"Tunnel failed for {instance_id}")
            return

        # Step 3: Deploy agent
        result = await deploy_agent_via_ssh(
            ssh_host=ssh_host, ssh_port=ssh_port,
            agent_api_key=agent_api_key, timeout=15,
        )
        if result["status"] != "success":
            logger.error(f"Agent deploy failed for {instance_id}: {result['message']}")
            await stop_tunnel(instance_id)
    except Exception as e:
        logger.exception(f"Background connect failed for {instance_id}: {e}")


@router.post("/cloud/connect")
async def connect_to_instance(
    request: ConnectRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Connect to a cloud GPU instance. Returns immediately, works in background.

    Creates a node record, then starts tunnel + agent deployment asynchronously.
    The node will transition: provisioning → offline → online (when agent heartbeats).
    """
    cred = await _get_user_credential(request.provider, current_user.id, db)

    # Check if already connected
    result = await db.execute(
        select(Node).where(
            Node.provider_instance_id == request.instance_id,
            Node.owner_id == current_user.id,
        )
    )
    existing = result.scalar_one_or_none()
    if existing and existing.status == NodeStatus.ONLINE.value:
        return {
            "node_id": existing.id,
            "status": "already_connected",
            "message": "This instance is already connected.",
        }

    # Generate agent API key
    agent_api_key = secrets.token_urlsafe(32)
    node_name = request.name or f"{request.provider}-{request.instance_id[:8]}"

    # Create or update node record — mark as "provisioning" immediately
    if existing:
        existing.api_key = agent_api_key
        existing.status = "provisioning"
        existing.name = node_name
        existing.gpu_type = request.gpu_type
        existing.gpu_count = request.gpu_count
        existing.gpu_memory_gb = request.gpu_ram_gb
        node = existing
    else:
        node = Node(
            name=node_name,
            status="provisioning",
            api_key=agent_api_key,
            owner_id=current_user.id,
            provider=request.provider,
            provider_instance_id=request.instance_id,
            gpu_type=request.gpu_type,
            gpu_count=request.gpu_count,
            gpu_memory_gb=request.gpu_ram_gb,
            ssh_host=request.ssh_host,
            ssh_port=request.ssh_port,
        )
        db.add(node)

    await db.flush()
    await db.refresh(node)

    # Get SSH connection details
    ssh_host = request.ssh_host
    ssh_port = request.ssh_port

    if not ssh_host and request.provider == "vastai":
        import httpx
        try:
            async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
                resp = await client.get(
                    f"https://console.vast.ai/api/v0/instances/{request.instance_id}/",
                    headers={"Authorization": f"Bearer {cred.api_key}"},
                )
                if resp.status_code == 200:
                    inst = resp.json()
                    if isinstance(inst, dict) and "instances" in inst:
                        inst = inst["instances"][0] if inst["instances"] else inst
                    ssh_host = inst.get("ssh_host")
                    ssh_port = inst.get("ssh_port")
        except Exception as e:
            logger.warning(f"Failed to get SSH details: {e}")

    if not ssh_host or not ssh_port:
        return {
            "node_id": node.id,
            "status": "no_ssh",
            "message": "Could not determine SSH address. Check that the instance is running.",
        }

    # Launch tunnel + deploy in background — return immediately
    import asyncio
    asyncio.create_task(
        _connect_background(
            provider=request.provider,
            instance_id=request.instance_id,
            ssh_host=ssh_host,
            ssh_port=ssh_port,
            agent_api_key=agent_api_key,
            vastai_api_key=cred.api_key,
        )
    )

    return {
        "node_id": node.id,
        "status": "provisioning",
        "message": "Connecting to GPU... Setting up tunnel and deploying agent. "
                   "The node will appear online within ~60 seconds.",
    }


# --- Search marketplace (Vast.ai only for now) ---

@router.post("/cloud/search-gpus", response_model=list)
async def search_cloud_gpus(
    min_gpu_ram_gb: float = 8.0,
    gpu_type: Optional[str] = None,
    num_gpus: int = 1,
    max_dph: Optional[float] = None,
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[dict]:
    """Search Vast.ai marketplace for GPU offers using user's API key."""
    cred = await _get_user_credential("vastai", current_user.id, db)

    from app.services.vastai_provider import VastAIProvider
    provider = VastAIProvider(cred.api_key)
    try:
        return await provider.search_gpus(
            min_gpu_ram_gb=min_gpu_ram_gb,
            gpu_type=gpu_type,
            num_gpus=num_gpus,
            max_dph=max_dph,
            limit=limit,
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to search Vast.ai: {str(e)}",
        )


# --- Provision / Destroy ---

class ProvisionRequest(BaseModel):
    provider: str = Field(..., pattern="^(vastai|lambda|aws)$")
    offer_id: Optional[int] = None  # vastai offer ID
    instance_type: Optional[str] = None  # lambda/aws instance type
    name: str = Field(default="cloud-gpu", min_length=1, max_length=255)
    disk_gb: int = Field(default=50, ge=10, le=1000)
    region: Optional[str] = None


@router.post("/cloud/provision")
async def provision_cloud_gpu(
    request: ProvisionRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Provision a cloud GPU instance using the user's stored API key."""
    cred = await _get_user_credential(request.provider, current_user.id, db)
    api_key_for_agent = secrets.token_urlsafe(32)

    if request.provider == "vastai":
        if not request.offer_id:
            raise HTTPException(status_code=400, detail="offer_id required for Vast.ai")

        from app.services.vastai_provider import VastAIProvider
        provider = VastAIProvider(cred.api_key)
        try:
            result = await provider.create_instance(
                offer_id=request.offer_id,
                docker_image="pytorch/pytorch:2.1.0-cuda12.1-cudnn8-devel",
                disk_gb=request.disk_gb,
            )
            instance_id = result["instance_id"]
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Vast.ai provisioning failed: {e}")

    else:
        raise HTTPException(
            status_code=400,
            detail=f"Provisioning not yet supported for {request.provider}. "
                   f"Launch instances via {request.provider} console, then detect them here.",
        )

    # Create node record
    node = Node(
        name=request.name,
        status=NodeStatus.OFFLINE.value,
        api_key=api_key_for_agent,
        owner_id=current_user.id,
        provider=request.provider,
        provider_instance_id=instance_id,
    )
    db.add(node)
    await db.flush()
    await db.refresh(node)

    return {
        "node_id": node.id,
        "provider": request.provider,
        "provider_instance_id": instance_id,
        "status": "provisioning",
        "message": f"Instance provisioned. It will appear online once the agent starts.",
    }


@router.get("/cloud/{node_id}/status")
async def get_cloud_node_status(
    node_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Check cloud instance status."""
    result = await db.execute(
        select(Node).where(
            Node.id == node_id,
            Node.owner_id == current_user.id,
        )
    )
    node = result.scalar_one_or_none()
    if not node or node.provider == "local":
        raise HTTPException(status_code=404, detail="Cloud node not found")

    return {
        "node_id": node.id,
        "node_status": node.status,
        "provider": node.provider,
        "provider_instance_id": node.provider_instance_id,
    }


@router.delete("/cloud/{node_id}")
async def destroy_cloud_gpu(
    node_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Destroy a cloud GPU instance."""
    result = await db.execute(
        select(Node).where(
            Node.id == node_id,
            Node.owner_id == current_user.id,
        )
    )
    node = result.scalar_one_or_none()
    if not node or node.provider == "local":
        raise HTTPException(status_code=404, detail="Cloud node not found")

    # Stop the SSH tunnel
    from app.services.ssh_connector import stop_tunnel
    await stop_tunnel(node.provider_instance_id or "")

    cred = await _get_user_credential(node.provider, current_user.id, db)
    destroyed = False

    if node.provider == "vastai" and node.provider_instance_id:
        from app.services.vastai_provider import VastAIProvider
        p = VastAIProvider(cred.api_key)
        destroyed = await p.destroy_instance(node.provider_instance_id)
    elif node.provider == "lambda" and node.provider_instance_id:
        from app.services.lambda_provider import LambdaProvider
        p = LambdaProvider(cred.api_key)
        destroyed = await p.destroy_instance(node.provider_instance_id)

    node.status = NodeStatus.OFFLINE.value
    await db.flush()

    return {
        "node_id": node.id,
        "destroyed": destroyed,
        "message": "Cloud instance destroyed" if destroyed else "Node marked offline",
    }
