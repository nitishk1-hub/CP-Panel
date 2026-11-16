#!/bin/bash
# Called only inside a fresh network namespace by verify-network-guard.mjs.
set -euo pipefail
work=$1
node_binary=$2
helper=$3
client_pid=''
http_pid=''
cleanup(){ [[ -z $http_pid ]] || kill "$http_pid" 2>/dev/null || true; [[ -z $client_pid ]] || kill "$client_pid" 2>/dev/null || true; }
trap cleanup EXIT
ip link set lo up
unshare --net sleep 120 & client_pid=$!
for attempt in {1..30}; do
 if [[ $(readlink /proc/"$client_pid"/ns/net) != $(readlink /proc/self/ns/net) ]]; then break; fi
 sleep 0.1
done
ip link add pnl-test-srv type veth peer name pnl-test-peer
ip address add 10.200.8.1/24 dev pnl-test-srv
ip link set pnl-test-srv up
ip link set pnl-test-peer netns "$client_pid"
nsenter -t "$client_pid" -n ip link set lo up
nsenter -t "$client_pid" -n ip address add 10.200.8.2/24 dev pnl-test-peer
nsenter -t "$client_pid" -n ip link set pnl-test-peer up
python3 -m http.server 28444 --bind 10.200.8.1 --directory "$work" > "$work/http.log" 2>&1 & http_pid=$!
for attempt in {1..30}; do
 if nsenter -t "$client_pid" -n curl --noproxy '*' -fsS --max-time 1 http://10.200.8.1:28444/ >/dev/null 2>&1; then break; fi
 sleep 0.1
done
nsenter -t "$client_pid" -n curl --noproxy '*' -fsS --max-time 2 http://10.200.8.1:28444/ >/dev/null
nft --check --file "$work/candidate.nft"
nft --file "$work/candidate.nft"
if nsenter -t "$client_pid" -n curl --noproxy '*' -fsS --max-time 2 http://10.200.8.1:28444/ >/dev/null 2>&1; then
 echo 'Expected a blocked new connection but the request succeeded' >&2; exit 1
fi
nft list chain inet server_panel_guard incoming | grep -Eq 'counter packets [1-9][0-9]* bytes'
"$node_binary" "$helper" rollback "$work" 00000000-0000-4000-8000-000000000001
nsenter -t "$client_pid" -n curl --noproxy '*' -fsS --max-time 2 http://10.200.8.1:28444/ >/dev/null
if nft list table inet server_panel_guard >/dev/null 2>&1; then echo 'Rollback left the test table active' >&2; exit 1; fi
nft --check --file "$work/ipv6.nft"
echo 'Passed: real new-flow blocking, packet counters, independent rollback and restored access; IPv6 and Docker original-port rule syntax validated. Host network untouched.'
