import { Link } from 'react-router-dom';
import { Box, Rocket, Square, Trash2, Power, MessageSquare, MoreHorizontal } from 'lucide-react';
import { useModels, useDeployModel, useUndeployModel, useDeleteModel } from '../hooks/useApi';
import type { TrainedModel, ModelStatus } from '../types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const statusStyles: Record<ModelStatus, { bg: string; text: string }> = {
  training: { bg: 'bg-warning/10', text: 'text-warning' },
  ready: { bg: 'bg-secondary', text: 'text-secondary-foreground' },
  deployed: { bg: 'bg-success/10', text: 'text-success' },
  failed: { bg: 'bg-destructive/10', text: 'text-destructive' },
};

export default function ModelsPage() {
  const { data, isLoading } = useModels();
  const deployMutation = useDeployModel();
  const undeployMutation = useUndeployModel();
  const deleteMutation = useDeleteModel();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Model Registry</h1>
        <p className="text-muted-foreground">Manage and deploy your fine-tuned models</p>
      </div>

      {isLoading ? (
        <div className="text-center py-12">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto" />
        </div>
      ) : data?.items.length ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {data.items.map((model: TrainedModel) => {
            const style = statusStyles[model.status];
            return (
              <Card key={model.id} className="group">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                        <Box className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-base">{model.name}</CardTitle>
                        <p className="text-sm text-muted-foreground">
                          {model.base_model}
                        </p>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {model.status !== 'deployed' && (
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => deleteMutation.mutate(model.id)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Metrics */}
                  {model.metrics && Object.keys(model.metrics).length > 0 && (
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      {Object.entries(model.metrics).slice(0, 4).map(([key, value]) => (
                        <div key={key}>
                          <p className="text-muted-foreground">{key}</p>
                          <p className="font-mono font-medium">
                            {typeof value === 'number' ? value.toFixed(4) : value}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t border-border">
                    {model.status === 'deployed' ? (
                      <>
                        <Badge className={`${style.bg} ${style.text} border-none`}>
                          <Power className="mr-1 h-3 w-3" />
                          Deployed
                        </Badge>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" asChild>
                            <Link to="/playground">
                              <MessageSquare className="mr-1 h-3 w-3" />
                              Test
                            </Link>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => undeployMutation.mutate(model.id)}
                            disabled={undeployMutation.isPending}
                          >
                            <Square className="h-3 w-3" />
                          </Button>
                        </div>
                      </>
                    ) : (
                      <>
                        <Badge variant="secondary" className={`${style.bg} ${style.text} border-none`}>
                          {model.status.charAt(0).toUpperCase() + model.status.slice(1)}
                        </Badge>
                        {model.status === 'ready' && (
                          <Button
                            size="sm"
                            onClick={() => deployMutation.mutate(model.id)}
                            disabled={deployMutation.isPending}
                          >
                            <Rocket className="mr-1 h-3 w-3" />
                            Deploy
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="text-center py-12">
            <Box className="w-12 h-12 mx-auto text-muted-foreground" />
            <p className="mt-4 text-muted-foreground">No trained models yet</p>
            <p className="text-sm text-muted-foreground">
              Complete a training job to see your models here
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
