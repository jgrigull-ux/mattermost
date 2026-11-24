#!/bin/sh
for dep in "$@"; do
    host="${dep%%:*}"
    port="${dep##*:}"
    i=0
    until nc -z -w 2 "$host" "$port"; do
        i=$((i + 1))
        [ "$i" -ge 120 ] && echo "timed out waiting for $dep" && exit 1
        sleep 1
    done
    echo "$dep is up"
done
