<script lang="ts">
  import { onMount } from 'svelte';
  import { Play, Square, Settings, Users } from 'lucide-svelte';
  import Button from '$lib/components/ui/button/index.svelte';
  import Input from '$lib/components/ui/input/index.svelte';
  import Card from '$lib/components/ui/card/index.svelte';

  interface WorkerStatus {
    isRunning: boolean;
    workerCount: number;
    activeWorkers: number;
    config: {
      maxWorkers: number;
      pollInterval: number;
      jobTimeout: number;
      retryAttempts: number;
      retryDelay: number;
    };
    realtime: {
      isInitialized: boolean;
      isConnected: boolean;
      isAvailable: boolean;
    };
  }

  interface ActiveWorker {
    id: string;
    status: 'idle' | 'busy' | 'stopped';
    current_job?: string;
    last_heartbeat: string;
    started_at: string;
  }

  let status: WorkerStatus | null = null;
  let activeWorkers: ActiveWorker[] = [];
  let newWorkerCount = '2';
  let loading = false;
  let error = '';
  let showConfigModal = false;
  let realtimeConfig: any = null;
  let realtimeTestResult: boolean | null = null;
  let config = {
    maxWorkers: '2',
    pollInterval: '5000',
    jobTimeout: '300000',
    retryAttempts: '3',
    retryDelay: '60000'
  };

  onMount(() => {
    loadStatus();
    loadRealtimeConfig();
    // Refresh status every 5 seconds
    const interval = setInterval(loadStatus, 5000);
    return () => clearInterval(interval);
  });

  async function loadStatus() {
    try {
      const response = await fetch('/api/v1/admin/workers');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      status = data.data.status;
      activeWorkers = data.data.activeWorkers;
      if (status) {
        newWorkerCount = status.config.maxWorkers.toString();
        config = {
          maxWorkers: status.config.maxWorkers.toString(),
          pollInterval: status.config.pollInterval.toString(),
          jobTimeout: status.config.jobTimeout.toString(),
          retryAttempts: status.config.retryAttempts.toString(),
          retryDelay: status.config.retryDelay.toString()
        };
      }
    } catch (err) {
      console.error('Failed to load worker status:', err);
    }
  }

  async function loadRealtimeConfig() {
    try {
      const response = await fetch('/api/v1/admin/workers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'getRealtimeConfig' })
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      realtimeConfig = data.data.realtimeConfig;
    } catch (err) {
      console.error('Failed to load realtime config:', err);
    }
  }

  async function testRealtime() {
    loading = true;
    error = '';
    try {
      const response = await fetch('/api/v1/admin/workers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'testRealtime' })
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      realtimeTestResult = data.data.realtimeTest;
      if (realtimeTestResult) {
        error = '';
      } else {
        error = 'Realtime test failed';
      }
    } catch (err) {
      error = 'Failed to test realtime';
      realtimeTestResult = false;
      console.error(err);
    } finally {
      loading = false;
    }
  }

  async function startWorkers() {
    loading = true;
    error = '';
    try {
      const response = await fetch('/api/v1/admin/workers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start' })
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      await loadStatus();
    } catch (err) {
      error = 'Failed to start workers';
      console.error(err);
    } finally {
      loading = false;
    }
  }

  async function stopWorkers() {
    loading = true;
    error = '';
    try {
      const response = await fetch('/api/v1/admin/workers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stop' })
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      await loadStatus();
    } catch (err) {
      error = 'Failed to stop workers';
      console.error(err);
    } finally {
      loading = false;
    }
  }

  async function updateWorkerCount() {
    loading = true;
    error = '';
    try {
      const response = await fetch('/api/v1/admin/workers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'updateWorkers',
          workerCount: parseInt(newWorkerCount)
        })
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      await loadStatus();
    } catch (err) {
      error = 'Failed to update worker count';
      console.error(err);
    } finally {
      loading = false;
    }
  }

  async function updateConfig() {
    loading = true;
    error = '';
    try {
      const numericConfig = {
        maxWorkers: parseInt(config.maxWorkers),
        pollInterval: parseInt(config.pollInterval),
        jobTimeout: parseInt(config.jobTimeout),
        retryAttempts: parseInt(config.retryAttempts),
        retryDelay: parseInt(config.retryDelay)
      };
      const response = await fetch('/api/v1/admin/workers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'updateConfig',
          config: numericConfig
        })
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      await loadStatus();
      showConfigModal = false;
    } catch (err) {
      error = 'Failed to update configuration';
      console.error(err);
    } finally {
      loading = false;
    }
  }

  function formatDate(dateString: string) {
    return new Date(dateString).toLocaleString();
  }

  function getStatusColor(status: string) {
    switch (status) {
      case 'idle': return 'bg-green-100 text-green-700';
      case 'busy': return 'bg-blue-100 text-blue-700';
      case 'stopped': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  }

  function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${Math.round(ms / 1000)}s`;
    return `${Math.round(ms / 60000)}m`;
  }

  function getRealtimeStatusColor(): string {
    if (!status?.realtime) return 'bg-gray-100 text-gray-700';
    if (status.realtime.isInitialized && status.realtime.isAvailable) {
      return 'bg-green-100 text-green-700';
    }
    return 'bg-red-100 text-red-700';
  }
</script>

<div class="space-y-6">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <div>
      <h2 class="text-2xl font-bold text-gray-900 dark:text-gray-100">Worker Management</h2>
      <p class="text-gray-600 dark:text-gray-400">Configure and monitor background job workers</p>
    </div>
  </div>

  {#if error}
    <div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
      {error}
    </div>
  {/if}

  <!-- Status Overview -->
  {#if status}
    <Card class="p-6">
      <div class="grid grid-cols-1 md:grid-cols-6 gap-4">
        <div class="text-center">
          <div class="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {status.workerCount}
          </div>
          <div class="text-sm text-gray-600 dark:text-gray-400">Total Workers</div>
        </div>
        <div class="text-center">
          <div class="text-2xl font-bold text-green-600">
            {status.activeWorkers}
          </div>
          <div class="text-sm text-gray-600 dark:text-gray-400">Active Workers</div>
        </div>
        <div class="text-center">
          <div class="text-2xl font-bold {status.isRunning ? 'text-green-600' : 'text-red-600'}">
            {status.isRunning ? 'Running' : 'Stopped'}
          </div>
          <div class="text-sm text-gray-600 dark:text-gray-400">Status</div>
        </div>
        <div class="text-center">
          <div class="text-2xl font-bold text-blue-600">
            📡
          </div>
          <div class="text-sm text-gray-600 dark:text-gray-400">Realtime</div>
          <div class="text-xs {getRealtimeStatusColor()} rounded-full px-2 py-1 mt-1">
            {status.realtime?.isInitialized ? 'Active' : 'Inactive'}
          </div>
        </div>
        <div class="text-center">
          <div class="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {formatDuration(status.config.pollInterval)}
          </div>
          <div class="text-sm text-gray-600 dark:text-gray-400">Poll Interval</div>
        </div>
        <div class="text-center">
          <div class="text-2xl font-bold text-purple-600">
            ⚡
          </div>
          <div class="text-sm text-gray-600 dark:text-gray-400">Latency</div>
          <div class="text-xs text-gray-500">
            {status.realtime?.isInitialized ? '< 100ms' : '5s+'}
          </div>
        </div>
      </div>
    </Card>
  {/if}

  <!-- Realtime Configuration -->
  {#if realtimeConfig}
    <Card class="p-6">
      <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Realtime Configuration</h3>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div>
          <div class="text-sm font-medium text-gray-700 dark:text-gray-300">Supabase URL</div>
          <div class="text-sm text-gray-600 dark:text-gray-400 truncate">{realtimeConfig.supabaseUrl}</div>
        </div>
        <div>
          <div class="text-sm font-medium text-gray-700 dark:text-gray-300">Realtime Support</div>
          <div class="text-sm {realtimeConfig.hasRealtime ? 'text-green-600' : 'text-red-600'}">
            {realtimeConfig.hasRealtime ? '✅ Available' : '❌ Not Available'}
          </div>
        </div>
        <div>
          <div class="text-sm font-medium text-gray-700 dark:text-gray-300">Status</div>
          <div class="text-sm {realtimeConfig.isEnabled ? 'text-green-600' : 'text-red-600'}">
            {realtimeConfig.isEnabled ? '✅ Enabled' : '❌ Disabled'}
          </div>
        </div>
      </div>

      <div class="flex gap-2">
        <Button
          on:click={testRealtime}
          disabled={loading}
          variant="outline"
          size="sm"
          class="flex items-center gap-2"
        >
          🧪 Test Realtime
        </Button>
        {#if realtimeTestResult !== null}
          <span class="text-sm {realtimeTestResult ? 'text-green-600' : 'text-red-600'} flex items-center">
            {realtimeTestResult ? '✅ Test Passed' : '❌ Test Failed'}
          </span>
        {/if}
      </div>
    </Card>
  {/if}

  <!-- Controls -->
  <Card class="p-6">
    <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Worker Controls</h3>

    <div class="space-y-4">
      <!-- Start/Stop Buttons -->
      <div class="flex gap-2">
        <Button
          on:click={startWorkers}
          disabled={loading || status?.isRunning}
          class="flex items-center gap-2"
        >
          <Play class="h-4 w-4" />
          Start Workers
        </Button>
        <Button
          on:click={stopWorkers}
          disabled={loading || !status?.isRunning}
          variant="destructive"
          class="flex items-center gap-2"
        >
          <Square class="h-4 w-4" />
          Stop Workers
        </Button>
        <Button
          on:click={() => showConfigModal = true}
          variant="outline"
          class="flex items-center gap-2"
        >
          <Settings class="h-4 w-4" />
          Configuration
        </Button>
      </div>

      <!-- Worker Count Configuration -->
      <div class="flex items-center gap-4">
        <div class="flex items-center gap-2">
          <Users class="h-4 w-4 text-gray-500" />
          <label for="workerCount" class="text-sm font-medium text-gray-700 dark:text-gray-300">
            Worker Count:
          </label>
        </div>
        <Input
          id="workerCount"
          type="number"
          min="1"
          max="10"
          bind:value={newWorkerCount}
          class="w-20"
        />
        <Button
          on:click={updateWorkerCount}
          disabled={loading || !status?.isRunning || newWorkerCount === status?.config.maxWorkers.toString()}
          size="sm"
          class="flex items-center gap-2"
        >
          <Settings class="h-4 w-4" />
          Update
        </Button>
      </div>
    </div>
  </Card>

  <!-- Configuration Modal -->
  {#if showConfigModal}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div class="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md">
        <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Worker Configuration</h3>

        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">Poll Interval (ms)</label>
            <Input
              type="number"
              bind:value={config.pollInterval}
              min="1000"
              max="30000"
              class="mt-1"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">Job Timeout (ms)</label>
            <Input
              type="number"
              bind:value={config.jobTimeout}
              min="60000"
              max="3600000"
              class="mt-1"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">Retry Attempts</label>
            <Input
              type="number"
              bind:value={config.retryAttempts}
              min="1"
              max="10"
              class="mt-1"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">Retry Delay (ms)</label>
            <Input
              type="number"
              bind:value={config.retryDelay}
              min="1000"
              max="300000"
              class="mt-1"
            />
          </div>
        </div>

        <div class="flex justify-end gap-2 mt-6">
          <Button
            on:click={() => showConfigModal = false}
            variant="outline"
          >
            Cancel
          </Button>
          <Button
            on:click={updateConfig}
            disabled={loading}
          >
            Save Configuration
          </Button>
        </div>
      </div>
    </div>
  {/if}

  <!-- Active Workers -->
  {#if activeWorkers.length > 0}
    <Card class="p-6">
      <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Active Workers</h3>

      <div class="space-y-3">
        {#each activeWorkers as worker}
          <div class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <div class="flex items-center gap-3">
              <Users class="h-4 w-4 text-gray-500" />
              <div>
                <div class="font-medium text-gray-900 dark:text-gray-100">{worker.id}</div>
                <div class="text-sm text-gray-600 dark:text-gray-400">
                  Started: {formatDate(worker.started_at)}
                </div>
                <div class="text-sm text-gray-600 dark:text-gray-400">
                  Last heartbeat: {formatDate(worker.last_heartbeat)}
                </div>
              </div>
            </div>
            <div class="flex items-center gap-3">
              {#if worker.current_job}
                <div class="text-sm text-gray-600 dark:text-gray-400">
                  Job: {worker.current_job}
                </div>
              {/if}
              <span class="rounded-full px-2 py-1 text-xs font-medium {getStatusColor(worker.status)}">
                {worker.status}
              </span>
            </div>
          </div>
        {/each}
      </div>
    </Card>
  {/if}
</div>