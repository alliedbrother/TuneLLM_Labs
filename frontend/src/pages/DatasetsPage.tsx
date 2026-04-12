import { useState } from 'react';
import { Trash2, Database, Upload, FileText, MoreHorizontal, Download, Eye, CheckCircle, AlertTriangle, Loader2, Globe, FolderOpen, X, ArrowLeft } from 'lucide-react';
import { useDatasets, useCreateDataset, useDeleteDataset } from '../hooks/useApi';
import type { Dataset } from '../types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import toast from 'react-hot-toast';
import api from '../services/api';

type ActiveView = 'list' | 'preview' | 'upload' | 'import' | 'create-pdf';

export default function DatasetsPage() {
  const [activeView, setActiveView] = useState<ActiveView>('list');
  const [selectedDatasetId, setSelectedDatasetId] = useState<number | null>(null);

  // Upload state
  const [uploadName, setUploadName] = useState('');
  const [uploadDesc, setUploadDesc] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  // HuggingFace import state
  const [hfDatasetId, setHfDatasetId] = useState('');
  const [hfName, setHfName] = useState('');
  const [hfSplit, setHfSplit] = useState('train');
  const [hfMaxSamples, setHfMaxSamples] = useState('');
  const [hfConfig, setHfConfig] = useState('');
  const [importing, setImporting] = useState(false);

  // PDF pipeline state
  const [pdfFiles, setPdfFiles] = useState<File[]>([]);
  const [pdfName, setPdfName] = useState('');
  const [pdfProvider, setPdfProvider] = useState('anthropic');
  const [pdfApiKey, setPdfApiKey] = useState('');
  const [pdfApiKeySaved, setPdfApiKeySaved] = useState(false);
  const [pdfModel, setPdfModel] = useState('');
  const [pdfQaCount, setPdfQaCount] = useState(3);
  const [creatingPdf, setCreatingPdf] = useState(false);

  // Preview state
  const [previewData, setPreviewData] = useState<{ rows: Record<string, unknown>[]; columns: string[]; total: number; offset: number; limit: number } | null>(null);
  const [validationResult, setValidationResult] = useState<Record<string, unknown> | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewPage, setPreviewPage] = useState(0);
  const PREVIEW_PAGE_SIZE = 50;

  const { data, isLoading, refetch } = useDatasets();
  const createMutation = useCreateDataset();
  const deleteMutation = useDeleteDataset();

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile || !uploadName) return;
    await createMutation.mutateAsync({ data: { name: uploadName, description: uploadDesc }, file: uploadFile });
    setUploadName(''); setUploadDesc(''); setUploadFile(null);
    setActiveView('list');
  };

  const handleImportHF = async () => {
    if (!hfDatasetId || !hfName) { toast.error('Dataset ID and name required'); return; }
    setImporting(true);
    try {
      await api.post('/datasets/import-huggingface', {
        dataset_id: hfDatasetId,
        name: hfName,
        split: hfSplit,
        max_samples: hfMaxSamples ? parseInt(hfMaxSamples) : undefined,
        config: hfConfig || undefined,
      });
      toast.success('Import started! Dataset will appear once download completes.');
      setHfDatasetId(''); setHfName(''); setHfMaxSamples(''); setHfConfig('');
      setActiveView('list');
      // Poll for completion
      setTimeout(() => refetch(), 5000);
      setTimeout(() => refetch(), 15000);
      setTimeout(() => refetch(), 30000);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Import failed');
    } finally { setImporting(false); }
  };

  const handleCreateFromPdf = async () => {
    if (pdfFiles.length === 0 || !pdfName) { toast.error('Select PDF files and enter a name'); return; }
    setCreatingPdf(true);
    try {
      const formData = new FormData();
      pdfFiles.forEach((f) => formData.append('files', f));
      formData.append('name', pdfName);
      formData.append('qa_provider', pdfProvider);
      if (pdfApiKey) formData.append('qa_api_key', pdfApiKey);
      if (pdfModel) formData.append('qa_model', pdfModel);
      formData.append('num_qa_per_chunk', String(pdfQaCount));

      await api.post('/datasets/create-from-pdf', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 300000, // 5 min for large PDFs
      });
      toast.success('PDF processing started! Generating Q&A pairs in the background...');
      setPdfFiles([]); setPdfName('');
      setActiveView('list');
      // Poll for completion
      const poll = setInterval(() => refetch(), 5000);
      setTimeout(() => clearInterval(poll), 120000); // stop after 2 min
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to process PDFs');
    } finally { setCreatingPdf(false); }
  };

  const loadSavedApiKey = async (provider: string) => {
    try {
      const resp = await api.get('/cloud/credentials');
      const creds = resp.data as { provider: string; api_key_preview: string }[];
      const saved = creds.find((c) => c.provider === provider);
      if (saved) {
        setPdfApiKeySaved(true);
        setPdfApiKey(''); // don't show the actual key, just indicate it's saved
      } else {
        setPdfApiKeySaved(false);
        setPdfApiKey('');
      }
    } catch {
      setPdfApiKeySaved(false);
    }
  };

  const openPreview = async (datasetId: number, page: number = 0) => {
    setSelectedDatasetId(datasetId);
    setPreviewPage(page);
    setLoadingPreview(true);
    setActiveView('preview');
    const offset = page * PREVIEW_PAGE_SIZE;
    try {
      const previewResp = await api.get(`/datasets/${datasetId}/preview?offset=${offset}&limit=${PREVIEW_PAGE_SIZE}`);
      setPreviewData(previewResp.data);
      // Only validate on first page load
      if (page === 0) {
        const validateResp = await api.get(`/datasets/${datasetId}/validate`);
        setValidationResult(validateResp.data);
      }
    } catch {
      toast.error('Failed to load preview');
      setActiveView('list');
    } finally { setLoadingPreview(false); }
  };

  const goToPage = (page: number) => {
    if (selectedDatasetId) openPreview(selectedDatasetId, page);
  };

  // ============ PREVIEW VIEW ============
  if (activeView === 'preview' && selectedDatasetId) {
    const dataset = data?.items.find((d: Dataset) => d.id === selectedDatasetId);
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => { setActiveView('list'); setPreviewData(null); setValidationResult(null); }}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{dataset?.name || 'Dataset'}</h1>
            <p className="text-muted-foreground">{dataset?.description || 'Preview dataset contents'}</p>
          </div>
        </div>

        {/* Validation */}
        {validationResult && (
          <Card className={validationResult.valid ? 'border-green-500/30' : 'border-yellow-500/30'}>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                {validationResult.valid ? (
                  <CheckCircle className="h-5 w-5 text-green-500" />
                ) : (
                  <AlertTriangle className="h-5 w-5 text-yellow-500" />
                )}
                <div>
                  <p className="font-medium">
                    {validationResult.valid ? 'Valid dataset' : 'Validation warnings'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {(validationResult.num_rows as number)?.toLocaleString()} rows
                    {' | '}Format: {validationResult.format_detected as string}
                    {' | '}Columns: {(validationResult.columns as string[])?.join(', ')}
                  </p>
                </div>
              </div>
              {(validationResult.errors as string[])?.length > 0 && (
                <div className="mt-3 text-sm text-yellow-600 space-y-1">
                  {(validationResult.errors as string[]).map((err, i) => (
                    <p key={i}>{err}</p>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Data table */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">Data Preview</CardTitle>
                <CardDescription>
                  Rows {(previewPage * PREVIEW_PAGE_SIZE) + 1}–{Math.min((previewPage + 1) * PREVIEW_PAGE_SIZE, previewData?.total || 0)} of {previewData?.total?.toLocaleString() || 0}
                </CardDescription>
              </div>
              {previewData && previewData.total > PREVIEW_PAGE_SIZE && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={previewPage === 0 || loadingPreview}
                    onClick={() => goToPage(previewPage - 1)}
                  >
                    Previous
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Page {previewPage + 1} of {Math.ceil(previewData.total / PREVIEW_PAGE_SIZE)}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={(previewPage + 1) * PREVIEW_PAGE_SIZE >= previewData.total || loadingPreview}
                    onClick={() => goToPage(previewPage + 1)}
                  >
                    Next
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {loadingPreview ? (
              <div className="text-center py-12">
                <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
              </div>
            ) : previewData?.rows.length ? (
              <>
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium text-xs w-8">#</th>
                        {previewData.columns.map((col) => (
                          <th key={col} className="px-3 py-2 text-left font-medium text-xs">{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {previewData.rows.map((row, i) => (
                        <tr key={i} className="hover:bg-muted/30">
                          <td className="px-3 py-2 text-muted-foreground text-xs">{previewPage * PREVIEW_PAGE_SIZE + i + 1}</td>
                          {previewData.columns.map((col) => (
                            <td key={col} className="px-3 py-2 max-w-[300px]">
                              <span className="text-xs whitespace-pre-wrap break-words">
                                {typeof row[col] === 'string' ? row[col] as string : JSON.stringify(row[col])}
                              </span>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* Bottom pagination */}
                {previewData.total > PREVIEW_PAGE_SIZE && (
                  <div className="flex items-center justify-between mt-4">
                    <p className="text-sm text-muted-foreground">
                      {previewData.total.toLocaleString()} total rows
                    </p>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" disabled={previewPage === 0 || loadingPreview} onClick={() => goToPage(0)}>
                        First
                      </Button>
                      <Button variant="outline" size="sm" disabled={previewPage === 0 || loadingPreview} onClick={() => goToPage(previewPage - 1)}>
                        Previous
                      </Button>
                      <span className="text-sm px-2">
                        {previewPage + 1} / {Math.ceil(previewData.total / PREVIEW_PAGE_SIZE)}
                      </span>
                      <Button variant="outline" size="sm" disabled={(previewPage + 1) * PREVIEW_PAGE_SIZE >= previewData.total || loadingPreview} onClick={() => goToPage(previewPage + 1)}>
                        Next
                      </Button>
                      <Button variant="outline" size="sm" disabled={(previewPage + 1) * PREVIEW_PAGE_SIZE >= previewData.total || loadingPreview} onClick={() => goToPage(Math.ceil(previewData.total / PREVIEW_PAGE_SIZE) - 1)}>
                        Last
                      </Button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="text-center py-8 text-muted-foreground">No data to preview</p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  const processingDatasets = data?.items.filter((d: Dataset) =>
    (d.num_samples === 0 || !d.num_samples) &&
    (d.description?.includes('Processing') || d.description?.includes('Generating') ||
     d.description?.includes('Extracting') || d.description?.includes('Importing'))
  ) || [];

  // ============ MAIN LIST VIEW ============
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Datasets</h1>
          <p className="text-muted-foreground">Manage your training datasets</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { setActiveView('create-pdf'); loadSavedApiKey(pdfProvider); }}>
            <FolderOpen className="mr-2 h-4 w-4" />
            Create from PDF
          </Button>
          <Button variant="outline" onClick={() => setActiveView('import')}>
            <Globe className="mr-2 h-4 w-4" />
            Import from HuggingFace
          </Button>
          <Button onClick={() => setActiveView('upload')}>
            <Upload className="mr-2 h-4 w-4" />
            Upload Dataset
          </Button>
        </div>
      </div>

      {/* Processing Banner */}
      {processingDatasets.length > 0 && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="py-3">
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-primary shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium">
                  {processingDatasets.length === 1 ? 'Creating dataset...' : `Creating ${processingDatasets.length} datasets...`}
                </p>
                <p className="text-xs text-muted-foreground">
                  {processingDatasets.map((d: Dataset) => `${d.name}: ${d.description}`).join(' | ')}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Upload Panel */}
      {activeView === 'upload' && (
        <Card className="border-primary/30">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Upload className="h-5 w-5 text-primary" />
                Upload Dataset
              </CardTitle>
              <Button variant="ghost" size="icon" onClick={() => setActiveView('list')}><X className="h-4 w-4" /></Button>
            </div>
            <CardDescription>Upload a JSONL, CSV, or Parquet file. Supported formats: Alpaca, Chat, OpenAI.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUpload} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input value={uploadName} onChange={(e) => setUploadName(e.target.value)} placeholder="my-dataset" required />
                </div>
                <div className="space-y-2">
                  <Label>File</Label>
                  <Input type="file" accept=".json,.jsonl,.csv,.parquet" onChange={(e) => setUploadFile(e.target.files?.[0] || null)} required />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Description (optional)</Label>
                <Input value={uploadDesc} onChange={(e) => setUploadDesc(e.target.value)} placeholder="Brief description" />
              </div>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                Upload
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* HuggingFace Import Panel */}
      {activeView === 'import' && (
        <Card className="border-primary/30">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Globe className="h-5 w-5 text-primary" />
                Import from HuggingFace
              </CardTitle>
              <Button variant="ghost" size="icon" onClick={() => setActiveView('list')}><X className="h-4 w-4" /></Button>
            </div>
            <CardDescription>Download a dataset from the HuggingFace Hub and convert to JSONL.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>HuggingFace Dataset ID</Label>
                <Input value={hfDatasetId} onChange={(e) => setHfDatasetId(e.target.value)} placeholder="e.g. rajpurkar/squad_v2" />
              </div>
              <div className="space-y-2">
                <Label>Name (local)</Label>
                <Input value={hfName} onChange={(e) => setHfName(e.target.value)} placeholder="my-squad-dataset" />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Split</Label>
                <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={hfSplit} onChange={(e) => setHfSplit(e.target.value)}>
                  <option value="train">train</option>
                  <option value="test">test</option>
                  <option value="validation">validation</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Max Samples (optional)</Label>
                <Input type="number" value={hfMaxSamples} onChange={(e) => setHfMaxSamples(e.target.value)} placeholder="e.g. 5000" />
              </div>
              <div className="space-y-2">
                <Label>Config/Subset (optional)</Label>
                <Input value={hfConfig} onChange={(e) => setHfConfig(e.target.value)} placeholder="e.g. plain_text" />
              </div>
            </div>
            <Button onClick={handleImportHF} disabled={importing}>
              {importing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
              Import Dataset
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Create from PDF Panel */}
      {activeView === 'create-pdf' && (
        <Card className="border-primary/30">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-lg">
                <FolderOpen className="h-5 w-5 text-primary" />
                Create Dataset from PDFs
              </CardTitle>
              <Button variant="ghost" size="icon" onClick={() => setActiveView('list')}><X className="h-4 w-4" /></Button>
            </div>
            <CardDescription>Extract text from PDFs and generate Q&A training data using AI.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Select PDF Files</Label>
                <div
                  className="flex items-center justify-between rounded-md border border-input hover:border-primary/50 transition-colors cursor-pointer px-3 h-9"
                  onClick={() => document.getElementById('pdf-file-input')?.click()}
                >
                  <input
                    id="pdf-file-input"
                    type="file"
                    accept=".pdf"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      setPdfFiles(files);
                      if (!pdfName && files.length > 0) {
                        setPdfName(files[0].name.replace('.pdf', '').replace(/\s+/g, '-').toLowerCase() + '-qa');
                      }
                    }}
                  />
                  {pdfFiles.length > 0 ? (
                    <span className="text-sm truncate">{pdfFiles.length} PDF{pdfFiles.length > 1 ? 's' : ''}: {pdfFiles.map(f => f.name).join(', ')}</span>
                  ) : (
                    <span className="text-sm text-muted-foreground">Click to select PDFs...</span>
                  )}
                  <Upload className="h-4 w-4 text-muted-foreground shrink-0 ml-2" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Dataset Name</Label>
                <Input value={pdfName} onChange={(e) => setPdfName(e.target.value)} placeholder="my-pdf-qa" />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>AI Provider</Label>
                <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={pdfProvider} onChange={(e) => { setPdfProvider(e.target.value); setPdfModel(''); loadSavedApiKey(e.target.value); }}>
                  <option value="anthropic">Claude (Anthropic)</option>
                  <option value="openai">GPT (OpenAI)</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Model</Label>
                <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={pdfModel} onChange={(e) => setPdfModel(e.target.value)}>
                  {pdfProvider === 'anthropic' ? (
                    <>
                      <option value="">claude-haiku-4-5 (default, fast + cheap)</option>
                      <option value="claude-sonnet-4-6">claude-sonnet-4-6 (balanced)</option>
                      <option value="claude-opus-4-6">claude-opus-4-6 (best quality)</option>
                      <option value="claude-sonnet-4-20250514">claude-sonnet-4 (legacy)</option>
                    </>
                  ) : (
                    <>
                      <option value="">gpt-4o (default)</option>
                      <option value="gpt-4o-mini">gpt-4o-mini (faster + cheaper)</option>
                      <option value="gpt-3.5-turbo">gpt-3.5-turbo (cheapest)</option>
                    </>
                  )}
                </select>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>{pdfProvider === 'anthropic' ? 'Anthropic API Key' : 'OpenAI API Key'}</Label>
                <Input
                  type="password"
                  value={pdfApiKey}
                  onChange={(e) => { setPdfApiKey(e.target.value); setPdfApiKeySaved(false); }}
                  placeholder={pdfApiKeySaved ? 'Using saved key (enter new to replace)' : pdfProvider === 'anthropic' ? 'sk-ant-...' : 'sk-...'}
                />
                {pdfApiKeySaved && !pdfApiKey && (
                  <p className="text-xs text-green-500">Using saved API key</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Q&A Pairs per Chunk</Label>
                <Input type="number" min={1} max={10} value={pdfQaCount} onChange={(e) => setPdfQaCount(Number(e.target.value))} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              The API key is sent directly to {pdfProvider === 'anthropic' ? 'Anthropic' : 'OpenAI'} and not stored on our server.
            </p>
            <Button onClick={handleCreateFromPdf} disabled={creatingPdf}>
              {creatingPdf ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />}
              Create Dataset
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Dataset Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">All Datasets</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-12">
              <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
            </div>
          ) : data?.items.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Format</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Rows</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((dataset: Dataset) => (
                  <TableRow
                    key={dataset.id}
                    className="cursor-pointer"
                    onClick={() => openPreview(dataset.id)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-primary/10 rounded-lg">
                          <FileText className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium">{dataset.name}</p>
                          {dataset.description && (
                            <p className="text-xs text-muted-foreground truncate max-w-[250px]">{dataset.description}</p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell><Badge variant="secondary">{dataset.format.toUpperCase()}</Badge></TableCell>
                    <TableCell>{formatBytes(dataset.file_size)}</TableCell>
                    <TableCell>
                      {dataset.num_samples && dataset.num_samples > 0 ? (
                        dataset.num_samples.toLocaleString()
                      ) : dataset.description?.includes('Processing') || dataset.description?.includes('Generating') || dataset.description?.includes('Extracting') || dataset.description?.includes('Importing') ? (
                        <span className="flex items-center gap-1 text-primary">
                          <Loader2 className="h-3 w-3 animate-spin" /> Processing
                        </span>
                      ) : dataset.description?.startsWith('Failed') ? (
                        <span className="text-destructive text-xs">Failed</span>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell>{new Date(dataset.created_at).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" onClick={(e) => e.stopPropagation()}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openPreview(dataset.id); }}>
                            <Eye className="mr-2 h-4 w-4" />
                            View Data
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(dataset.id); }}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-12">
              <Database className="w-12 h-12 mx-auto text-muted-foreground" />
              <p className="mt-4 text-muted-foreground">No datasets yet</p>
              <p className="text-sm text-muted-foreground">Upload, import, or create a dataset to get started</p>
              <div className="flex gap-2 justify-center mt-4">
                <Button variant="outline" onClick={() => setActiveView('import')}>
                  <Globe className="mr-2 h-4 w-4" /> Import from HuggingFace
                </Button>
                <Button onClick={() => setActiveView('upload')}>
                  <Upload className="mr-2 h-4 w-4" /> Upload Dataset
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
