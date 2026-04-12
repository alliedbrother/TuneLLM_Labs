import { useState, useEffect } from 'react';
import { Server, Cpu, HardDrive, Activity, Terminal, Copy, Cloud, Trash2, Search, Loader2, Key, Plus, RefreshCw, Eye, EyeOff, Plug } from 'lucide-react';
import NodeCard from '../components/Hardware/NodeCard';
import { useHardwareNodes, useDestroyCloud } from '../hooks/useApi';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import toast from 'react-hot-toast';
import api from '../services/api';
import type { CloudGpuOffer } from '../types';

interface CloudCredential {
  id: number;
  provider: string;
  label: string | null;
  api_key_preview: string;
  backend_url: string | null;
  created_at: string;
  updated_at: string;
}

interface DetectedGPU {
  provider: string;
  instance_id: string;
  name: string;
  status: string;
  gpu_type: string;
  gpu_count: number;
  gpu_ram_gb: number;
  ip_address: string | null;
  ssh_port: number | null;
  region: string | null;
  disk_gb: number | null;
  price_per_hour: number | null;
}

interface ProviderInfo {
  id: string;
  name: string;
  description: string;
  requires_extra: boolean;
  extra_label: string | null;
}

const providerLogos: Record<string, string> = {
  vastai: 'Vast.ai',
  lambda: 'Lambda',
  aws: 'AWS',
};

export default function HardwarePage() {
  const { data: nodes, isLoading, refetch: refetchNodes } = useHardwareNodes();
  const destroyCloudMutation = useDestroyCloud();

  // Credentials state
  const [credentials, setCredentials] = useState<CloudCredential[]>([]);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [newProvider, setNewProvider] = useState('');
  const [newApiKey, setNewApiKey] = useState('');
  const [newExtraData, setNewExtraData] = useState('');
  const [newBackendUrl, setNewBackendUrl] = useState('');
  const [localGPUs, setLocalGPUs] = useState<{ name: string; memory_gb: number; utilization: number }[]>([]);
  void localGPUs; // referenced below in detect
  const [detectingLocal, setDetectingLocal] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [savingKey, setSavingKey] = useState(false);

  // GPU detection state
  const [detectedGPUs, setDetectedGPUs] = useState<DetectedGPU[]>([]);
  const [detectingProvider, setDetectingProvider] = useState<string | null>(null);
  const [connectingInstanceId, setConnectingInstanceId] = useState<string | null>(null);

  // Vast.ai marketplace state
  const [showMarketplace, setShowMarketplace] = useState(false);
  const [cloudOffers, setCloudOffers] = useState<CloudGpuOffer[]>([]);
  const [searchingGpus, setSearchingGpus] = useState(false);
  const [provisioningId, setProvisioningId] = useState<number | null>(null);

  const onlineCount = nodes?.filter((n) => n.status === 'online').length || 0;
  const busyCount = nodes?.filter((n) => n.status === 'busy').length || 0;
  const totalGpus = nodes?.reduce((acc, n) => acc + n.gpu_count, 0) || 0;

  useEffect(() => {
    fetchProviders();
    // Fetch credentials then auto-detect GPUs for all GPU providers
    fetchCredentials().then((creds) => {
      if (creds) {
        const gpuCreds = creds.filter((c: CloudCredential) => GPU_PROVIDERS.includes(c.provider));
        gpuCreds.forEach((c: CloudCredential) => detectGPUs(c.provider));
      }
    });
  }, []);

  const fetchCredentials = async (): Promise<CloudCredential[] | null> => {
    try {
      const resp = await api.get<CloudCredential[]>('/cloud/credentials');
      setCredentials(resp.data);
      return resp.data;
    } catch { return null; }
  };

  const fetchProviders = async () => {
    try {
      const resp = await api.get<ProviderInfo[]>('/cloud/providers');
      setProviders(resp.data);
    } catch { /* ignore */ }
  };

  const saveApiKey = async () => {
    if (!newProvider || !newApiKey) {
      toast.error('Select a provider and enter an API key');
      return;
    }
    setSavingKey(true);
    try {
      await api.post('/cloud/credentials', {
        provider: newProvider,
        api_key: newApiKey,
        extra_data: newExtraData || undefined,
        backend_url: newBackendUrl || undefined,
      });
      toast.success('API key saved!');
      setNewApiKey('');
      setNewExtraData('');
      setNewBackendUrl('');
      setNewProvider('');
      await fetchCredentials();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to save API key');
    } finally {
      setSavingKey(false);
    }
  };

  const deleteCredential = async (id: number) => {
    try {
      await api.delete(`/cloud/credentials/${id}`);
      toast.success('API key removed');
      await fetchCredentials();
    } catch {
      toast.error('Failed to remove API key');
    }
  };

  const detectGPUs = async (provider: string) => {
    setDetectingProvider(provider);
    try {
      const resp = await api.get<DetectedGPU[]>(`/cloud/detect-gpus/${provider}`);
      setDetectedGPUs(resp.data);
      if (resp.data.length === 0) {
        toast('No existing GPU instances found. Rent one from the provider, then refresh.', { icon: 'i' });
      } else {
        toast.success(`Found ${resp.data.length} GPU instance(s) on ${providerLogos[provider] || provider}`);
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || `Failed to detect GPUs from ${provider}`);
      setDetectedGPUs([]);
    } finally {
      setDetectingProvider(null);
    }
  };

  const detectLocalGPUs = async () => {
    setDetectingLocal(true);
    try {
      const resp = await api.get('/hardware/detect-local');
      setLocalGPUs(resp.data.gpus || []);
      if (resp.data.count === 0) {
        toast('No local GPUs detected on this machine.', { icon: 'i' });
      } else {
        toast.success(`Found ${resp.data.count} local GPU(s)`);
      }
    } catch {
      toast.error('Failed to detect local GPUs');
    } finally { setDetectingLocal(false); }
  };

  const connectToInstance = async (gpu: DetectedGPU) => {
    setConnectingInstanceId(gpu.instance_id);
    const toastId = toast.loading('Setting up SSH connection...');
    try {
      toast.loading('Uploading SSH key to cloud provider...', { id: toastId });

      const resp = await api.post('/cloud/connect', {
        provider: gpu.provider,
        instance_id: gpu.instance_id,
        name: gpu.name,
        gpu_type: gpu.gpu_type,
        gpu_count: gpu.gpu_count,
        gpu_ram_gb: gpu.gpu_ram_gb,
        ssh_host: gpu.ip_address,
        ssh_port: gpu.ssh_port,
      });
      const data = resp.data;

      if (data.status === 'provisioning' || data.status === 'connecting') {
        toast.success('Connecting to GPU... This takes about 60 seconds. The node will appear online automatically.', { id: toastId, duration: 8000 });
        // Poll for the node to come online
        const poll = setInterval(() => refetchNodes(), 5000);
        setTimeout(() => clearInterval(poll), 120000);
        refetchNodes();
      } else if (data.status === 'already_connected') {
        toast.success('Already connected!', { id: toastId });
      } else if (data.status === 'no_ssh') {
        toast.error('Could not determine SSH address. Is the instance running?', { id: toastId });
      } else {
        toast.error(data.message || 'Connection failed', { id: toastId });
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Connection failed', { id: toastId });
    } finally {
      setConnectingInstanceId(null);
    }
  };

  const searchVastMarketplace = async () => {
    setSearchingGpus(true);
    try {
      const resp = await api.post<CloudGpuOffer[]>('/cloud/search-gpus', null, {
        params: { min_gpu_ram_gb: 8, limit: 20 },
      });
      setCloudOffers(resp.data);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to search marketplace');
    } finally {
      setSearchingGpus(false);
    }
  };

  const provisionGpu = async (offer: CloudGpuOffer) => {
    setProvisioningId(offer.id);
    try {
      await api.post('/cloud/provision', {
        provider: 'vastai',
        offer_id: offer.id,
        name: `vast-${offer.gpu_name.replace(/\s+/g, '-').toLowerCase()}`,
      });
      toast.success(
        'GPU rented! The instance will boot in 1-3 minutes. Click "Detect GPUs" to check when it\'s ready, then click "Connect".',
        { duration: 8000 }
      );
      setShowMarketplace(false);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to rent GPU');
    } finally {
      setProvisioningId(null);
    }
  };

  const copyCommand = (command: string) => {
    navigator.clipboard.writeText(command);
    toast.success('Copied to clipboard');
  };

  // Filter to only show GPU providers on this page (not AI providers like anthropic/openai)
  const GPU_PROVIDERS = ['vastai', 'lambda', 'aws'];
  const gpuCredentials = credentials.filter((c) => GPU_PROVIDERS.includes(c.provider));
  const gpuProviders = providers.filter((p: any) => p.is_gpu_provider !== false);
  const hasVastKey = credentials.some((c) => c.provider === 'vastai');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Hardware</h1>
          <p className="text-muted-foreground">Manage your GPU nodes and compute resources</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={detectLocalGPUs} disabled={detectingLocal}>
            {detectingLocal ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Cpu className="h-4 w-4 mr-2" />}
            Detect Local GPUs
          </Button>
          <Button variant="outline" onClick={() => setShowSettings(!showSettings)}>
            <Key className="h-4 w-4 mr-2" />
            API Keys
          </Button>
          {hasVastKey && (
            <Button
              variant={showMarketplace ? 'secondary' : 'default'}
              onClick={() => { setShowMarketplace(!showMarketplace); if (!showMarketplace) searchVastMarketplace(); }}
            >
              <Cloud className="h-4 w-4 mr-2" />
              {showMarketplace ? 'Close Marketplace' : 'Rent Cloud GPU'}
            </Button>
          )}
        </div>
      </div>

      {/* API Key Settings Panel */}
      {showSettings && (
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Key className="h-5 w-5 text-primary" />
              Cloud Provider API Keys
            </CardTitle>
            <CardDescription>
              Add your cloud provider API keys to detect and manage GPU instances
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Existing keys */}
            {gpuCredentials.length > 0 && (
              <div className="space-y-2">
                {gpuCredentials.map((cred) => (
                  <div key={cred.id} className="flex items-center justify-between rounded-lg border p-3">
                    <div className="flex items-center gap-3">
                      <Badge variant="secondary">{providerLogos[cred.provider] || cred.provider}</Badge>
                      <span className="font-mono text-sm text-muted-foreground">{cred.api_key_preview}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => detectGPUs(cred.provider)}
                        disabled={detectingProvider === cred.provider}
                      >
                        {detectingProvider === cred.provider ? (
                          <Loader2 className="h-3 w-3 animate-spin mr-1" />
                        ) : (
                          <Search className="h-3 w-3 mr-1" />
                        )}
                        Detect GPUs
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() => {
                          if (confirm('Remove this API key?')) deleteCredential(cred.id);
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <Separator />

            {/* Add new key */}
            <div className="space-y-3">
              <p className="text-sm font-medium">Add API Key</p>
              <div className="grid gap-3 md:grid-cols-4">
                <div>
                  <Label htmlFor="provider-select">Provider</Label>
                  <select
                    id="provider-select"
                    className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={newProvider}
                    onChange={(e) => setNewProvider(e.target.value)}
                  >
                    <option value="">Select provider</option>
                    {gpuProviders.map((p: any) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <Label htmlFor="api-key-input">API Key</Label>
                  <div className="relative mt-1">
                    <Input
                      id="api-key-input"
                      type={showKey ? 'text' : 'password'}
                      placeholder="Enter your API key"
                      value={newApiKey}
                      onChange={(e) => setNewApiKey(e.target.value)}
                    />
                    <button
                      className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowKey(!showKey)}
                    >
                      {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="flex items-end">
                  <Button onClick={saveApiKey} disabled={savingKey} className="w-full">
                    {savingKey ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
                    Save
                  </Button>
                </div>
              </div>
              {newProvider === 'aws' && (
                <div>
                  <Label htmlFor="secret-key">AWS Secret Access Key</Label>
                  <Input
                    id="secret-key"
                    type="password"
                    placeholder="AWS Secret Access Key"
                    value={newExtraData}
                    onChange={(e) => setNewExtraData(e.target.value)}
                    className="mt-1"
                  />
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Detected GPUs — always visible */}
      {gpuCredentials.length > 0 && (
        <Card className="border-green-500/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Search className="h-5 w-5 text-green-500" />
              Detected Cloud GPU Instances
            </CardTitle>
            <CardDescription>
              These instances are running on your cloud account. Select which to use with TuneLLM.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {detectedGPUs.length > 0 ? (
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Provider</th>
                    <th className="px-3 py-2 text-left font-medium">Name</th>
                    <th className="px-3 py-2 text-left font-medium">GPU</th>
                    <th className="px-3 py-2 text-left font-medium">Status</th>
                    <th className="px-3 py-2 text-left font-medium">Cost</th>
                    <th className="px-3 py-2 text-right font-medium">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {detectedGPUs.map((gpu) => {
                    const isConnected = nodes?.some(
                      (n) => n.provider_instance_id === gpu.instance_id && n.status === 'online'
                    );
                    const isConnecting = connectingInstanceId === gpu.instance_id;
                    const isPending = nodes?.some(
                      (n) => n.provider_instance_id === gpu.instance_id && (n.status === 'offline' || n.status === 'provisioning')
                    );

                    return (
                      <tr key={`${gpu.provider}-${gpu.instance_id}`} className="hover:bg-muted/30">
                        <td className="px-3 py-2">
                          <Badge variant="secondary">{providerLogos[gpu.provider]}</Badge>
                        </td>
                        <td className="px-3 py-2 font-medium">{gpu.name}</td>
                        <td className="px-3 py-2">
                          {gpu.gpu_count}x {gpu.gpu_type}
                          {gpu.gpu_ram_gb > 0 && ` (${gpu.gpu_ram_gb}GB)`}
                        </td>
                        <td className="px-3 py-2">
                          <span className={gpu.status === 'running' ? 'text-green-500' : 'text-yellow-500'}>
                            {gpu.status}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          {gpu.price_per_hour ? `$${gpu.price_per_hour.toFixed(3)}/hr` : '-'}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {isConnected ? (
                            <Badge className="bg-green-500/10 text-green-500 border-green-500/30">Connected</Badge>
                          ) : isConnecting ? (
                            <Button size="sm" disabled>
                              <Loader2 className="h-3 w-3 animate-spin mr-1" />
                              Connecting...
                            </Button>
                          ) : isPending ? (
                            <Button size="sm" variant="outline" onClick={() => refetchNodes()}>
                              <RefreshCw className="h-3 w-3 mr-1" />
                              Waiting...
                            </Button>
                          ) : gpu.status === 'running' ? (
                            <Button size="sm" onClick={() => connectToInstance(gpu)}>
                              <Plug className="h-3 w-3 mr-1" />
                              Connect
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">Not running</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            ) : detectingProvider ? (
              <div className="text-center py-6">
                <Loader2 className="h-5 w-5 animate-spin mx-auto text-primary" />
                <p className="text-sm text-muted-foreground mt-2">Detecting cloud GPU instances...</p>
              </div>
            ) : (
              <div className="text-center py-6 text-muted-foreground">
                <p className="text-sm">No cloud GPU instances detected.</p>
                <p className="text-xs mt-1">Rent a GPU from the marketplace, or check that your instances are running.</p>
                <Button variant="outline" size="sm" className="mt-3" onClick={() => {
                  gpuCredentials.forEach((c) => detectGPUs(c.provider));
                }}>
                  <RefreshCw className="h-3 w-3 mr-1" /> Refresh
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Vast.ai Marketplace */}
      {showMarketplace && (
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Cloud className="h-5 w-5 text-primary" />
              Vast.ai GPU Marketplace
            </CardTitle>
            <CardDescription>Browse and rent GPU instances</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex justify-end mb-3">
              <Button variant="outline" size="sm" onClick={searchVastMarketplace} disabled={searchingGpus}>
                <RefreshCw className={`h-3 w-3 mr-1 ${searchingGpus ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
            {searchingGpus ? (
              <div className="text-center py-8">
                <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
                <p className="mt-2 text-sm text-muted-foreground">Searching marketplace...</p>
              </div>
            ) : cloudOffers.length > 0 ? (
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">GPU</th>
                      <th className="px-3 py-2 text-left font-medium">VRAM</th>
                      <th className="px-3 py-2 text-left font-medium">CPU</th>
                      <th className="px-3 py-2 text-left font-medium">RAM</th>
                      <th className="px-3 py-2 text-left font-medium">Disk</th>
                      <th className="px-3 py-2 text-left font-medium">$/hr</th>
                      <th className="px-3 py-2 text-left font-medium">Reliability</th>
                      <th className="px-3 py-2 text-right font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {cloudOffers
                      .filter((o) => o.gpu_ram_gb >= 8)
                      .sort((a, b) => a.dph_total - b.dph_total)
                      .slice(0, 15)
                      .map((offer) => (
                      <tr key={offer.id} className="hover:bg-muted/30">
                        <td className="px-3 py-2 font-medium">
                          {offer.gpu_name}
                          {offer.num_gpus > 1 && ` x${offer.num_gpus}`}
                        </td>
                        <td className="px-3 py-2">{offer.gpu_ram_gb} GB</td>
                        <td className="px-3 py-2">{Math.round(offer.cpu_cores)} cores</td>
                        <td className="px-3 py-2">{offer.ram_gb} GB</td>
                        <td className="px-3 py-2">{offer.disk_gb} GB</td>
                        <td className="px-3 py-2 font-medium text-primary">${offer.dph_total.toFixed(3)}</td>
                        <td className="px-3 py-2">
                          <span className={offer.reliability > 0.95 ? 'text-green-500' : offer.reliability > 0.9 ? 'text-yellow-500' : 'text-red-500'}>
                            {(offer.reliability * 100).toFixed(1)}%
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Button size="sm" onClick={() => provisionGpu(offer)} disabled={provisioningId !== null}>
                            {provisioningId === offer.id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Rent'}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-center py-6 text-muted-foreground">No offers found</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* No API keys prompt */}
      {gpuCredentials.length === 0 && !showSettings && (
        <Card className="border-dashed">
          <CardContent className="pt-6 text-center">
            <Key className="h-10 w-10 mx-auto text-muted-foreground" />
            <p className="mt-3 font-medium">No cloud providers configured</p>
            <p className="text-sm text-muted-foreground mt-1">
              Add your Vast.ai, Lambda Labs, or AWS API key to detect and rent cloud GPUs
            </p>
            <Button className="mt-4" onClick={() => setShowSettings(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add API Key
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-2 bg-primary/10 rounded-lg"><Server className="h-5 w-5 text-primary" /></div>
              <div>
                <p className="text-sm text-muted-foreground">Total Nodes</p>
                <p className="text-2xl font-bold">{nodes?.length || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-2 bg-success/10 rounded-lg"><Activity className="h-5 w-5 text-success" /></div>
              <div>
                <p className="text-sm text-muted-foreground">Online</p>
                <p className="text-2xl font-bold text-success">{onlineCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-2 bg-chart-2/10 rounded-lg"><Cpu className="h-5 w-5 text-chart-2" /></div>
              <div>
                <p className="text-sm text-muted-foreground">Busy</p>
                <p className="text-2xl font-bold text-chart-2">{busyCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-2 bg-accent/10 rounded-lg"><HardDrive className="h-5 w-5 text-accent-foreground" /></div>
              <div>
                <p className="text-sm text-muted-foreground">Total GPUs</p>
                <p className="text-2xl font-bold">{totalGpus}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Nodes Grid */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">GPU Nodes</CardTitle>
              <CardDescription>Connected compute resources</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => refetchNodes()}>
              <RefreshCw className="h-4 w-4 mr-1" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-12">
              <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto" />
            </div>
          ) : nodes?.length ? (
            <div className="grid gap-4 md:grid-cols-2">
              {nodes.map((node) => (
                <div key={node.id} className="relative">
                  <NodeCard node={node} />
                  {node.provider !== 'local' && (
                    <div className="absolute top-3 right-3 flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {providerLogos[node.provider] || node.provider}
                      </Badge>
                      {node.hourly_cost && (
                        <span className="text-xs text-muted-foreground">${node.hourly_cost.toFixed(3)}/hr</span>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                        onClick={() => {
                          if (confirm('Destroy this cloud instance?')) destroyCloudMutation.mutate(node.id);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <Server className="w-12 h-12 mx-auto text-muted-foreground" />
              <p className="mt-4 text-muted-foreground">No nodes connected</p>
              <p className="text-sm text-muted-foreground">Add an API key above or connect a local GPU node</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Local node instructions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Terminal className="h-5 w-5 text-primary" />
            Add a Local Node
          </CardTitle>
          <CardDescription>Run the TuneLLM agent on your GPU machine to connect it</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg bg-card border border-border p-4 font-mono text-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-muted-foreground"># Run the agent</span>
              <Button variant="ghost" size="sm" onClick={() => copyCommand(
                'docker run --gpus all -d \\\n  -e SERVER_URL=http://your-server:8000 \\\n  -e NODE_NAME=my-gpu-node \\\n  ghcr.io/tunellm/agent:latest'
              )}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-success">docker run --gpus all -d \</p>
            <p className="text-success pl-4">-e SERVER_URL=http://your-server:8000 \</p>
            <p className="text-success pl-4">-e NODE_NAME=my-gpu-node \</p>
            <p className="text-success pl-4">ghcr.io/tunellm/agent:latest</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
