import { useState, useEffect } from 'react';
import { FolderOpen, Play, Loader2, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import toast from 'react-hot-toast';
import api from '../services/api';

interface PipelineJob {
  id: number;
  name: string;
  status: string;
  directory_path: string;
  total_pdfs: number;
  processed_pdfs: number;
  total_chunks: number;
  generated_qa_pairs: number;
  train_dataset_id: number | null;
  test_dataset_id: number | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

export default function PipelinePage() {
  const [dirPath, setDirPath] = useState('');
  const [datasetName, setDatasetName] = useState('');
  const [description, setDescription] = useState('');
  const [qaProvider, setQaProvider] = useState('anthropic');
  const [numQaPerChunk, setNumQaPerChunk] = useState(3);
  const [testSplitRatio, setTestSplitRatio] = useState(0.2);
  const [starting, setStarting] = useState(false);

  const [jobs, setJobs] = useState<PipelineJob[]>([]);
  const [pollingJobId, setPollingJobId] = useState<number | null>(null);

  // Fetch existing pipeline jobs on load
  useEffect(() => {
    fetchJobs();
  }, []);

  // Poll active job
  useEffect(() => {
    if (!pollingJobId) return;
    const interval = setInterval(async () => {
      try {
        const resp = await api.get<PipelineJob>(`/pipeline/jobs/${pollingJobId}`);
        const job = resp.data;
        setJobs((prev) => prev.map((j) => (j.id === job.id ? job : j)));
        if (job.status === 'completed' || job.status === 'failed') {
          setPollingJobId(null);
          if (job.status === 'completed') {
            toast.success(`Pipeline complete! ${job.generated_qa_pairs} Q&A pairs generated.`);
          } else {
            toast.error(`Pipeline failed: ${job.error_message}`);
          }
        }
      } catch {
        // Ignore polling errors
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [pollingJobId]);

  const fetchJobs = async () => {
    try {
      const resp = await api.get<PipelineJob[]>('/pipeline/jobs');
      setJobs(resp.data);
    } catch {
      // Ignore
    }
  };

  const startPipeline = async () => {
    if (!dirPath || !datasetName) {
      toast.error('Directory path and dataset name are required');
      return;
    }
    setStarting(true);
    try {
      const resp = await api.post('/pipeline/process-directory', {
        directory_path: dirPath,
        dataset_name: datasetName,
        description: description || undefined,
        qa_provider: qaProvider,
        num_qa_per_chunk: numQaPerChunk,
        test_split_ratio: testSplitRatio,
      });
      const jobId = resp.data.pipeline_job_id;
      toast.success('Pipeline started!');
      setPollingJobId(jobId);
      await fetchJobs();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to start pipeline');
    } finally {
      setStarting(false);
    }
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'pending':
        return <AlertCircle className="h-4 w-4 text-muted-foreground" />;
      default:
        return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Data Pipeline</h1>
        <p className="text-muted-foreground">
          Convert PDFs into Q&A training datasets using AI
        </p>
      </div>

      {/* Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <FolderOpen className="h-5 w-5 text-primary" />
            Process PDF Directory
          </CardTitle>
          <CardDescription>
            Point to a directory of PDF files. The pipeline will extract text,
            generate Q&A pairs, and create train/test datasets.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="dir-path">Directory Path</Label>
              <Input
                id="dir-path"
                placeholder="/path/to/your/pdfs"
                value={dirPath}
                onChange={(e) => setDirPath(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dataset-name">Dataset Name</Label>
              <Input
                id="dataset-name"
                placeholder="my-medical-qa"
                value={datasetName}
                onChange={(e) => setDatasetName(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description (optional)</Label>
            <Input
              id="description"
              placeholder="Q&A dataset generated from medical research papers"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="qa-provider">AI Provider</Label>
              <select
                id="qa-provider"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={qaProvider}
                onChange={(e) => setQaProvider(e.target.value)}
              >
                <option value="anthropic">Claude (Anthropic)</option>
                <option value="openai">GPT (OpenAI)</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="qa-count">Q&A Pairs per Chunk</Label>
              <Input
                id="qa-count"
                type="number"
                min={1}
                max={10}
                value={numQaPerChunk}
                onChange={(e) => setNumQaPerChunk(Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="split-ratio">Test Split Ratio</Label>
              <Input
                id="split-ratio"
                type="number"
                min={0.05}
                max={0.5}
                step={0.05}
                value={testSplitRatio}
                onChange={(e) => setTestSplitRatio(Number(e.target.value))}
              />
            </div>
          </div>

          <Button onClick={startPipeline} disabled={starting} className="w-full md:w-auto">
            {starting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Play className="h-4 w-4 mr-2" />
            )}
            Process Directory
          </Button>
        </CardContent>
      </Card>

      {/* Pipeline Jobs */}
      {jobs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Pipeline Jobs</CardTitle>
            <CardDescription>Processing history and progress</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {jobs.map((job) => (
                <div
                  key={job.id}
                  className="flex items-center justify-between rounded-lg border p-4"
                >
                  <div className="flex items-center gap-3">
                    {statusIcon(job.status)}
                    <div>
                      <p className="font-medium">{job.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {job.directory_path}
                      </p>
                    </div>
                  </div>
                  <div className="text-right text-sm">
                    {job.status === 'completed' ? (
                      <div>
                        <p className="text-green-600 font-medium">
                          {job.generated_qa_pairs} Q&A pairs
                        </p>
                        <p className="text-muted-foreground">
                          {job.total_pdfs} PDFs, {job.total_chunks} chunks
                        </p>
                      </div>
                    ) : job.status === 'failed' ? (
                      <p className="text-red-500 text-xs max-w-xs truncate">
                        {job.error_message}
                      </p>
                    ) : (
                      <div>
                        <p className="text-primary">
                          {job.status.replace(/_/g, ' ')}...
                        </p>
                        {job.total_pdfs > 0 && (
                          <p className="text-muted-foreground">
                            {job.processed_pdfs}/{job.total_pdfs} PDFs
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
