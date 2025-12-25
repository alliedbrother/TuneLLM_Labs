import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeftIcon, StopIcon } from '@heroicons/react/24/outline';
import JobStatusBadge from '../components/Jobs/JobStatusBadge';
import { useJob, useJobLogs, useCancelJob } from '../hooks/useApi';

export default function JobDetailPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const { data: job, isLoading } = useJob(Number(jobId));
  const { data: logs } = useJobLogs(Number(jobId));
  const cancelMutation = useCancelJob();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Job not found</p>
      </div>
    );
  }

  const formatDate = (dateString?: string) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => navigate('/jobs')}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <ArrowLeftIcon className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center space-x-3">
              <h1 className="text-2xl font-bold text-gray-900">{job.name}</h1>
              <JobStatusBadge status={job.status} />
            </div>
            <p className="mt-1 text-gray-500">{job.base_model}</p>
          </div>
        </div>
        {(job.status === 'pending' || job.status === 'running' || job.status === 'queued') && (
          <button
            onClick={() => cancelMutation.mutate(job.id)}
            disabled={cancelMutation.isPending}
            className="btn btn-danger flex items-center"
          >
            <StopIcon className="w-5 h-5 mr-2" />
            Cancel Job
          </button>
        )}
      </div>

      {/* Progress */}
      {job.status === 'running' && job.progress !== undefined && (
        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">Progress</span>
            <span className="text-sm text-gray-500">{job.progress}%</span>
          </div>
          <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary-500 transition-all duration-500"
              style={{ width: `${job.progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Details */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Job Details</h2>
          <dl className="space-y-3">
            <div className="flex justify-between">
              <dt className="text-gray-500">Method</dt>
              <dd className="font-medium">{job.method.toUpperCase()}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Created</dt>
              <dd className="font-medium">{formatDate(job.created_at)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Started</dt>
              <dd className="font-medium">{formatDate(job.started_at)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Completed</dt>
              <dd className="font-medium">{formatDate(job.completed_at)}</dd>
            </div>
            {job.node_id && (
              <div className="flex justify-between">
                <dt className="text-gray-500">Node</dt>
                <dd className="font-medium">Node #{job.node_id}</dd>
              </div>
            )}
          </dl>
        </div>

        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Configuration</h2>
          <pre className="bg-gray-50 p-4 rounded-lg text-sm overflow-x-auto">
            {JSON.stringify(job.config, null, 2)}
          </pre>
        </div>
      </div>

      {/* Error Message */}
      {job.error_message && (
        <div className="card bg-red-50 border-red-200">
          <h2 className="text-lg font-semibold text-red-800 mb-2">Error</h2>
          <p className="text-red-700">{job.error_message}</p>
        </div>
      )}

      {/* Logs */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-4">Logs</h2>
        <div className="bg-gray-900 rounded-lg p-4 h-96 overflow-y-auto font-mono text-sm">
          {logs?.length ? (
            logs.map((log) => (
              <div key={log.id} className="flex">
                <span className="text-gray-500 mr-4 shrink-0">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
                <span
                  className={
                    log.level === 'error'
                      ? 'text-red-400'
                      : log.level === 'warning'
                      ? 'text-yellow-400'
                      : 'text-gray-300'
                  }
                >
                  {log.message}
                </span>
              </div>
            ))
          ) : (
            <p className="text-gray-500">No logs available</p>
          )}
        </div>
      </div>
    </div>
  );
}
