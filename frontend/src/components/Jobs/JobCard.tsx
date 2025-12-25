import { Link } from 'react-router-dom';
import { CpuChipIcon, ClockIcon } from '@heroicons/react/24/outline';
import JobStatusBadge from './JobStatusBadge';
import type { FineTuneJob } from '../../types';

interface JobCardProps {
  job: FineTuneJob;
}

export default function JobCard({ job }: JobCardProps) {
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <Link
      to={`/jobs/${job.id}`}
      className="block card hover:shadow-md transition-shadow"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-primary-50 rounded-lg">
            <CpuChipIcon className="w-5 h-5 text-primary-600" />
          </div>
          <div>
            <h3 className="font-medium text-gray-900">{job.name}</h3>
            <p className="text-sm text-gray-500">{job.base_model}</p>
          </div>
        </div>
        <JobStatusBadge status={job.status} />
      </div>

      <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
        <div className="flex items-center space-x-4">
          <span className="inline-flex items-center px-2 py-0.5 rounded bg-gray-100 text-gray-700">
            {job.method.toUpperCase()}
          </span>
          {job.progress !== undefined && job.status === 'running' && (
            <div className="flex items-center">
              <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary-500 transition-all"
                  style={{ width: `${job.progress}%` }}
                />
              </div>
              <span className="ml-2">{job.progress}%</span>
            </div>
          )}
        </div>
        <div className="flex items-center">
          <ClockIcon className="w-4 h-4 mr-1" />
          {formatDate(job.created_at)}
        </div>
      </div>
    </Link>
  );
}
