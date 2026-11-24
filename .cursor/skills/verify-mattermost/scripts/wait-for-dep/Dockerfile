# Verification scaffolding: a stand-in for mattermost/mattermost-wait-for-dep:latest, built by
# verify-mattermost.sh launch only when Docker Hub blobs are unreachable. Same contract: wait until
# every host:port argument accepts TCP connections, then exit 0.
FROM public.ecr.aws/docker/library/busybox:1.37
COPY wait.sh /wait.sh
ENTRYPOINT ["sh", "/wait.sh"]
