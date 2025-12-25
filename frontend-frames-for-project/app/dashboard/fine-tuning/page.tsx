import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { FineTuningBuilder } from "@/components/fine-tuning/fine-tuning-builder"

export default function FineTuning() {
  return (
    <DashboardLayout>
      <FineTuningBuilder />
    </DashboardLayout>
  )
}
