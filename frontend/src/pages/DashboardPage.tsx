import {
  CircleStackIcon,
  CpuChipIcon,
  CubeIcon,
  ServerStackIcon,
} from '@heroicons/react/24/outline';
import StatsCard from '../components/Dashboard/StatsCard';
import JobCard from '../components/Jobs/JobCard';
import { useJobs, useDatasets, useModels, useHardwareNodes } from '../hooks/useApi';

export default function DashboardPage() {
  const { data: jobsData } = useJobs(1, 5);
  const { data: datasetsData } = useDatasets(1, 100);
  const { data: modelsData } = useModels(1, 100);
  const { data: nodes } = useHardwareNodes();

  const runningJobs = jobsData?.items.filter((j) => j.status === 'running').length || 0;
  const onlineNodes = nodes?.filter((n) => n.status === 'online').length || 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-gray-500">
          Overview of your fine-tuning platform
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatsCard
          title="Datasets"
          value={datasetsData?.total || 0}
          icon={<CircleStackIcon className="w-6 h-6" />}
        />
        <StatsCard
          title="Running Jobs"
          value={runningJobs}
          icon={<CpuChipIcon className="w-6 h-6" />}
          change={`${jobsData?.total || 0} total jobs`}
        />
        <StatsCard
          title="Trained Models"
          value={modelsData?.total || 0}
          icon={<CubeIcon className="w-6 h-6" />}
        />
        <StatsCard
          title="Online Nodes"
          value={onlineNodes}
          icon={<ServerStackIcon className="w-6 h-6" />}
          change={`${nodes?.length || 0} total nodes`}
        />
      </div>

      {/* Recent Jobs */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Jobs</h2>
        {jobsData?.items.length ? (
          <div className="grid gap-4">
            {jobsData.items.map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>
        ) : (
          <div className="card text-center py-12">
            <CpuChipIcon className="w-12 h-12 mx-auto text-gray-400" />
            <p className="mt-4 text-gray-500">No training jobs yet</p>
            <p className="text-sm text-gray-400">
              Create your first fine-tuning job to get started
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
