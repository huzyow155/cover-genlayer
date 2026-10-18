# Nimbus Cloud System Status

**Current incident**
Incident: Latency spike in storage subsystem.
Status: Degraded performance.
Duration: 90 minutes.

### Incident Details
Storage nodes in us-east region are experiencing elevated read latencies under peak load.
Background indexing tasks have been throttled to restore throughput for customer operations.
Read and write requests continue to succeed although response latencies are elevated.
Our engineering team is actively tuning cache parameters to alleviate contention.
