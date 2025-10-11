# Wayli Helm Chart

A Helm chart for deploying Wayli - a privacy-first location analysis and trip tracking application.

## Prerequisites

- Kubernetes 1.19+
- Helm 3.2.0+
- PersistentVolume provisioner support in the underlying infrastructure (for Supabase)

## Installation

### Add the Wayli Helm repository

```bash
helm repo add wayli https://wayli-app.github.io/wayli
helm repo update
```

### Install the chart

```bash
# Create a namespace for Wayli
kubectl create namespace wayli

# Install with default values
helm install wayli wayli/wayli -n wayli

# Install with custom values
helm install wayli wayli/wayli -n wayli -f custom-values.yaml
```

## Configuration

> **Note:** Kubernetes manifests for Wayli deployments and services will be added in the next phase. This chart currently contains the base structure and configuration values.

### Basic Configuration

The following table lists the main configurable parameters of the Wayli chart and their default values.

| Parameter | Description | Default |
|-----------|-------------|---------|
| `image.repository` | Wayli image repository | `zehbart/wayli` |
| `image.tag` | Wayli image tag (overrides Chart.yaml appVersion) | `""` |
| `image.pullPolicy` | Image pull policy | `IfNotPresent` |
| `web.enabled` | Enable web deployment | `true` |
| `web.replicaCount` | Number of web replicas | `2` |
| `web.service.type` | Kubernetes service type | `ClusterIP` |
| `web.service.port` | Service port | `80` |
| `worker.enabled` | Enable worker deployment | `true` |
| `worker.replicaCount` | Number of worker replicas | `1` |
| `ingress.enabled` | Enable ingress controller resource | `false` |
| `ingress.hosts` | Ingress hosts configuration | `[]` |

### Environment Variables

Configure Wayli through the `env` section in `values.yaml`:

```yaml
env:
  NODE_ENV: production
  PUBLIC_SUPABASE_URL: "https://your-supabase-url.supabase.co"
  PUBLIC_SUPABASE_ANON_KEY: "your-anon-key"
```

### Secrets

Sensitive configuration should be provided via Kubernetes secrets:

```yaml
secrets:
  SUPABASE_SERVICE_ROLE_KEY: "your-service-role-key"
  OWNTRACKS_SERVICE_KEY: "your-owntracks-key"
```

> **Recommendation**: Use external secret management solutions like [External Secrets Operator](https://external-secrets.io/) or [Sealed Secrets](https://github.com/bitnami-labs/sealed-secrets) for production deployments.

### Ingress

To enable external access via Ingress:

```yaml
ingress:
  enabled: true
  className: nginx
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
  hosts:
    - host: wayli.example.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: wayli-tls
      hosts:
        - wayli.example.com
```

### Resource Limits

Configure resource requests and limits:

```yaml
web:
  resources:
    limits:
      cpu: 500m
      memory: 512Mi
    requests:
      cpu: 250m
      memory: 256Mi

worker:
  resources:
    limits:
      cpu: 500m
      memory: 512Mi
    requests:
      cpu: 250m
      memory: 256Mi
```

### Autoscaling

Enable horizontal pod autoscaling for the web deployment:

```yaml
web:
  autoscaling:
    enabled: true
    minReplicas: 2
    maxReplicas: 10
    targetCPUUtilizationPercentage: 80
```

## Supabase Integration

> **Note:** Supabase will be added as a Helm chart dependency in a future update. For now, you'll need to deploy Supabase separately or use a managed Supabase instance.

Options for Supabase deployment:
1. **Managed Supabase**: Use [Supabase Cloud](https://supabase.com) (recommended for production)
2. **Self-hosted**: Deploy Supabase separately using their [official Helm chart](https://github.com/supabase-community/supabase-kubernetes)
3. **Chart dependency**: Coming in a future release

## Upgrading

### Upgrade to a new version

```bash
# Update repository
helm repo update

# Upgrade release
helm upgrade wayli wayli/wayli -n wayli

# Upgrade with custom values
helm upgrade wayli wayli/wayli -n wayli -f custom-values.yaml
```

### View release history

```bash
helm history wayli -n wayli
```

### Rollback to previous version

```bash
helm rollback wayli -n wayli
```

## Uninstallation

To uninstall/delete the `wayli` release:

```bash
helm uninstall wayli -n wayli
```

This command removes all the Kubernetes components associated with the chart and deletes the release.

## Version Management

This Helm chart is automatically versioned and released via GitHub Actions:

- **Chart Version**: Incremented automatically with each release
- **App Version**: Synced with Wayli application releases (semantic versioning)
- **Docker Images**: Tagged with semantic versions (e.g., `v0.0.1`)

Available versions:
- [Helm Chart Releases](https://github.com/wayli-app/wayli/releases)
- [Docker Hub Tags](https://hub.docker.com/r/zehbart/wayli/tags)

## Examples

### Minimal Installation

```yaml
# minimal-values.yaml
ingress:
  enabled: true
  hosts:
    - host: wayli.local
      paths:
        - path: /
          pathType: Prefix

env:
  PUBLIC_SUPABASE_URL: "https://your-project.supabase.co"
  PUBLIC_SUPABASE_ANON_KEY: "your-anon-key"
```

```bash
helm install wayli wayli/wayli -f minimal-values.yaml -n wayli
```

### Production Installation

```yaml
# production-values.yaml
web:
  replicaCount: 3
  autoscaling:
    enabled: true
    minReplicas: 3
    maxReplicas: 20
  resources:
    limits:
      cpu: 1000m
      memory: 1Gi
    requests:
      cpu: 500m
      memory: 512Mi

worker:
  replicaCount: 2
  resources:
    limits:
      cpu: 1000m
      memory: 1Gi
    requests:
      cpu: 500m
      memory: 512Mi

ingress:
  enabled: true
  className: nginx
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
  hosts:
    - host: wayli.example.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: wayli-tls
      hosts:
        - wayli.example.com
```

```bash
helm install wayli wayli/wayli -f production-values.yaml -n wayli
```

## Troubleshooting

### Check pod status

```bash
kubectl get pods -n wayli
```

### View pod logs

```bash
kubectl logs -n wayli -l app.kubernetes.io/name=wayli -f
```

### Describe pod for events

```bash
kubectl describe pod -n wayli <pod-name>
```

### Test connectivity

```bash
kubectl run -it --rm debug --image=curlimages/curl --restart=Never -n wayli -- sh
# Inside the pod:
curl http://wayli-web
```

## Support

For issues and questions:
- [GitHub Issues](https://github.com/wayli-app/wayli/issues)
- [Documentation](https://github.com/wayli-app/wayli)
- [Helm Chart Repository](https://wayli-app.github.io/wayli)

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](../../CONTRIBUTING.md) for details.

## License

Wayli is licensed under the MIT License. See [LICENSE](../../LICENSE) for details.
