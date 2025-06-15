<script lang="ts">
	// Dashboard component for enterprise site
	let isPanelOpen = false;

	function togglePanel() {
		isPanelOpen = !isPanelOpen;
	}
</script>

<div class="space-y-6">
	<div class="bg-white shadow-sm rounded-lg p-6 flex items-center justify-between">
		<h1 class="text-2xl font-semibold text-gray-900">Enterprise Dashboard</h1>
	</div>

	<div class="bg-white shadow-sm rounded-lg p-6">
		<h2 class="text-lg font-medium text-gray-900">Key Performance Metrics</h2>
		<div class="mt-4 text-gray-700 space-y-2">
			<p>Monitor your organization's most important metrics at a glance:</p>
			<ul class="list-disc list-inside space-y-1">
				<li>
					<span class="font-semibold">Revenue Trends:</span> Track monthly and quarterly revenue
					growth to identify business momentum.
				</li>
				<li>
					<span class="font-semibold">User Growth:</span> Analyze new user signups and active
					user rates to measure engagement.
				</li>
				<li>
					<span class="font-semibold">Project Completion Rate:</span> Stay updated on ongoing
					and completed projects for better resource planning.
				</li>
				<li>
					<span class="font-semibold">Customer Satisfaction:</span> Review feedback scores
					and support ticket resolution times.
				</li>
			</ul>
		</div>
	</div>

	<div class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
		<div class="bg-white shadow-sm rounded-lg p-6">
			<h3 class="text-lg font-medium text-gray-900">Business Overview</h3>
			<dl class="mt-4 space-y-4">
				<div>
					<dt class="text-sm font-medium text-gray-500">Monthly Revenue</dt>
					<dd class="mt-1 text-3xl font-semibold text-acme-blue">$234,567</dd>
				</div>
				<div>
					<dt class="text-sm font-medium text-gray-500">Active Projects</dt>
					<dd class="mt-1 text-3xl font-semibold text-acme-blue">42</dd>
				</div>
			</dl>
		</div>

		<div class="bg-white shadow-sm rounded-lg p-6">
			<h3 class="text-lg font-medium text-gray-900">Recent Updates</h3>
			<ul class="mt-4 space-y-4">
				<li class="text-sm text-gray-600">Q2 Report published - 2 minutes ago</li>
				<li class="text-sm text-gray-600">New client onboarding - 5 minutes ago</li>
				<li class="text-sm text-gray-600">Team meeting scheduled - 10 minutes ago</li>
			</ul>
		</div>

		<div class="bg-white shadow-sm rounded-lg p-6">
			<h3 class="text-lg font-medium text-gray-900">System Status</h3>
			<div class="mt-4">
				<div class="flex items-center">
					<div class="h-2.5 w-2.5 rounded-full bg-green-500 mr-2"></div>
					<span class="text-sm text-gray-600">All systems operational</span>
				</div>
				<div class="mt-2">
					<div class="flex items-center">
						<div class="h-2.5 w-2.5 rounded-full bg-green-500 mr-2"></div>
						<span class="text-sm text-gray-600">99.9% uptime this month</span>
					</div>
				</div>
			</div>
		</div>
	</div>
</div>
