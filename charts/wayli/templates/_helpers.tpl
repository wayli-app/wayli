{{/*
Expand the name of the chart.
*/}}
{{- define "wayli.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "wayli.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "wayli.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "wayli.labels" -}}
helm.sh/chart: {{ include "wayli.chart" . }}
{{ include "wayli.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- with .Values.global.labels }}
{{ toYaml . }}
{{- end }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "wayli.selectorLabels" -}}
app.kubernetes.io/name: {{ include "wayli.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Component-specific selector labels
*/}}
{{- define "wayli.selectorLabels.web" -}}
{{ include "wayli.selectorLabels" . }}
app.kubernetes.io/component: web
{{- end }}

{{- define "wayli.selectorLabels.worker" -}}
{{ include "wayli.selectorLabels" . }}
app.kubernetes.io/component: worker
{{- end }}

{{- define "wayli.selectorLabels.public" -}}
{{ include "wayli.selectorLabels" . }}
app.kubernetes.io/component: public
{{- end }}

{{- define "wayli.selectorLabels.pgbouncer" -}}
{{ include "wayli.selectorLabels" . }}
app.kubernetes.io/component: pgbouncer
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "wayli.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "wayli.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Return the proper Wayli image name
*/}}
{{- define "wayli.image" -}}
{{- $tag := .Values.image.tag | default .Chart.AppVersion }}
{{- printf "%s:%s" .Values.image.repository $tag }}
{{- end }}

{{/*
Return the proper Wayli public image name
*/}}
{{- define "wayli.publicImage" -}}
{{- $tag := .Values.publicImage.tag | default .Chart.AppVersion }}
{{- printf "%s:%s" .Values.publicImage.repository $tag }}
{{- end }}

{{/*
Return the proper PgBouncer image name
*/}}
{{- define "wayli.pgbouncer.image" -}}
{{- printf "%s:%s" .Values.pgbouncer.image.repository .Values.pgbouncer.image.tag }}
{{- end }}

{{/*
Return the proper init container image name (postgres)
*/}}
{{- define "wayli.initContainer.postgres.image" -}}
{{- printf "%s:%s" .Values.web.initContainers.waitForDb.image.repository .Values.web.initContainers.waitForDb.image.tag }}
{{- end }}

{{/*
Return the proper init container image name (flyway)
*/}}
{{- define "wayli.initContainer.flyway.image" -}}
{{- printf "%s:%s" .Values.web.initContainers.migrations.flywayImage.repository .Values.web.initContainers.migrations.flywayImage.tag }}
{{- end }}

{{/*
Return the proper image pull secrets
*/}}
{{- define "wayli.imagePullSecrets" -}}
{{- if .Values.image.pullSecrets }}
imagePullSecrets:
{{- range .Values.image.pullSecrets }}
  - name: {{ . }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Return the Supabase secret name
*/}}
{{- define "wayli.supabaseSecretName" -}}
{{- if .Values.supabase.global.supabase.existingSecret }}
{{- .Values.supabase.global.supabase.existingSecret }}
{{- else }}
{{- printf "%s-supabase" (include "wayli.fullname" .) }}
{{- end }}
{{- end }}

{{/*
Return the Pexels secret name
*/}}
{{- define "wayli.pexelsSecretName" -}}
{{- if .Values.global.pexels.existingSecret }}
{{- .Values.global.pexels.existingSecret }}
{{- else }}
{{- printf "%s-pexels" (include "wayli.fullname" .) }}
{{- end }}
{{- end }}

{{/*
Return the SMTP secret name
*/}}
{{- define "wayli.smtpSecretName" -}}
{{- if .Values.supabase.global.supabase.auth.smtp.existingSecret }}
{{- .Values.supabase.global.supabase.auth.smtp.existingSecret }}
{{- else }}
{{- printf "%s-smtp" (include "wayli.fullname" .) }}
{{- end }}
{{- end }}

{{/*
Compile all warnings into a single message
*/}}
{{- define "wayli.validateValues" -}}
{{- $messages := list -}}
{{- if and (not .Values.supabase.global.supabase.existingSecret) (not .Values.secrets.supabase.values.jwtSecret) -}}
{{- $messages = append $messages "WARNING: No Supabase JWT secret configured. Set supabase.global.supabase.existingSecret or secrets.supabase.values.jwtSecret" -}}
{{- end -}}
{{- if and (not .Values.supabase.global.supabase.existingSecret) (not .Values.secrets.supabase.values.dbPassword) -}}
{{- $messages = append $messages "WARNING: No database password configured. Set supabase.global.supabase.existingSecret or secrets.supabase.values.dbPassword" -}}
{{- end -}}
{{- if $messages -}}
{{- printf "\nVALIDATION WARNINGS:\n%s" (join "\n" $messages) | fail -}}
{{- end -}}
{{- end -}}

{{/*
Return the database URL for init containers
*/}}
{{- define "wayli.databaseUrl" -}}
{{- $dbHost := printf "%s.%s.svc.cluster.local" (include "wayli.supabase.dbHost" .) .Release.Namespace -}}
{{- $dbPort := include "wayli.supabase.dbPort" . -}}
{{- $dbName := include "wayli.supabase.dbName" . -}}
{{- $dbUser := include "wayli.supabase.dbUser" . -}}
{{- printf "postgresql://%s:%s@%s:%v/%s?prepareThreshold=0" $dbUser "$(FLYWAY_PASSWORD)" $dbHost $dbPort $dbName -}}
{{- end -}}

{{/*
Return the Supabase database URL for workers (conditionally uses pgbouncer from supabase chart)
*/}}
{{- define "wayli.supabase.dbUrl" -}}
{{- if and .Values.supabase.db .Values.supabase.db.pgbouncer.enabled -}}
{{- $pgHost := printf "%s.%s.svc.cluster.local" .Values.supabase.db.pgbouncer.service.name .Release.Namespace -}}
{{- $pgPort := .Values.supabase.db.pgbouncer.service.port -}}
{{- $dbName := include "wayli.supabase.dbName" . -}}
{{- $dbUser := include "wayli.supabase.dbUser" . -}}
{{- printf "postgresql://%s:$(SUPABASE_DB_PASSWORD)@%s:%v/%s" $dbUser $pgHost $pgPort $dbName -}}
{{- else -}}
{{- $dbHost := printf "%s-supabase-db.%s.svc.cluster.local" .Release.Name .Release.Namespace -}}
{{- $dbPort := include "wayli.supabase.dbPort" . -}}
{{- $dbName := include "wayli.supabase.dbName" . -}}
{{- $dbUser := include "wayli.supabase.dbUser" . -}}
{{- printf "postgresql://%s:$(SUPABASE_DB_PASSWORD)@%s:%v/%s" $dbUser $dbHost $dbPort $dbName -}}
{{- end -}}
{{- end -}}

{{/*
Return the Supabase public URL
*/}}
{{- define "wayli.supabase.url" -}}
{{- if .Values.externalSupabase.enabled -}}
{{- .Values.externalSupabase.url -}}
{{- else if .Values.supabase.global.supabase.publicUrl -}}
{{- .Values.supabase.global.supabase.publicUrl -}}
{{- else -}}
{{- fail "Either externalSupabase.url or supabase.global.supabase.publicUrl must be set" -}}
{{- end -}}
{{- end -}}

{{/*
Return the Supabase database host (uses pgbouncer if enabled)
*/}}
{{- define "wayli.supabase.dbHost" -}}
{{- if .Values.externalSupabase.enabled -}}
{{- .Values.externalSupabase.dbHost -}}
{{- else if and .Values.supabase.db .Values.supabase.db.pgbouncer.enabled -}}
{{- printf "%s-supabase-pgbouncer" .Release.Name -}}
{{- else -}}
{{- printf "%s-supabase-db" .Release.Name -}}
{{- end -}}
{{- end -}}

{{/*
Return the Supabase database port
*/}}
{{- define "wayli.supabase.dbPort" -}}
{{- if .Values.externalSupabase.enabled -}}
{{- .Values.externalSupabase.dbPort -}}
{{- else if and .Values.supabase.db .Values.supabase.db.pgbouncer.enabled -}}
{{- .Values.supabase.db.pgbouncer.service.port | default 6432 -}}
{{- else -}}
5432
{{- end -}}
{{- end -}}

{{/*
Return the Supabase database name
*/}}
{{- define "wayli.supabase.dbName" -}}
{{- if .Values.externalSupabase.enabled -}}
{{- .Values.externalSupabase.dbName -}}
{{- else -}}
postgres
{{- end -}}
{{- end -}}

{{/*
Return the Supabase database user
*/}}
{{- define "wayli.supabase.dbUser" -}}
{{- if .Values.externalSupabase.enabled -}}
{{- .Values.externalSupabase.dbUser -}}
{{- else -}}
supabase_admin
{{- end -}}
{{- end -}}

{{/*
Return the Supabase Kong host
*/}}
{{- define "wayli.supabase.kongHost" -}}
{{- if .Values.externalSupabase.enabled -}}
{{- .Values.externalSupabase.kongHost -}}
{{- else -}}
{{- printf "%s-supabase-kong" .Release.Name -}}
{{- end -}}
{{- end -}}

{{/*
Return the Supabase Kong port
*/}}
{{- define "wayli.supabase.kongPort" -}}
{{- if .Values.externalSupabase.enabled -}}
{{- .Values.externalSupabase.kongPort -}}
{{- else -}}
8000
{{- end -}}
{{- end -}}

{{/*
Return trusted origins as comma-separated string
*/}}
{{- define "wayli.trustedOrigins" -}}
{{- join "," .Values.web.env.trustedOrigins -}}
{{- end -}}

{{/*
Return CORS origins as comma-separated string
*/}}
{{- define "wayli.corsOrigin" -}}
{{- join "," .Values.web.env.corsOrigin -}}
{{- end -}}

{{/*
Return worker CORS origin
*/}}
{{- define "wayli.worker.corsOrigin" -}}
{{- .Values.worker.env.corsOrigin -}}
{{- end -}}
