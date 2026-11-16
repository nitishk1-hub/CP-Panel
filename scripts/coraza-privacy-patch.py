"""Patch only the pinned connector's logging adapter; never change WAF decisions."""
import hashlib,pathlib,sys
source=pathlib.Path(sys.argv[1]);target=source/'coraza.go';s=target.read_text()
old='\t\tlogMsg := mr.ErrorLog()'
new='''\t\t// CyberPross: never log matched values, headers, bodies or URL queries.
\t\tlogMsg := "Coraza signature matched"
\t\tlogger := logger.With(zap.Int("rule_id", mr.Rule().ID()), zap.Int("severity", int(mr.Rule().Severity())), zap.String("client_ip", mr.ClientIPAddress()), zap.String("unique_id", mr.TransactionID()), zap.String("rule_version", mr.Rule().Version()), zap.Strings("tags", mr.Rule().Tags()))'''
if s.count(old)!=1:raise SystemExit('Pinned connector logging shape changed; review required')
s=s.replace(old,new)
old='\t\t\tzap.String("uri", r.RequestURI),'
new='\t\t\tzap.String("path", r.URL.EscapedPath()),\n\t\t\tzap.Int("rule_id", it.RuleID),\n\t\t\tzap.String("action", it.Action),\n\t\t\tzap.Int("status", it.Status),'
if s.count(old)!=1:raise SystemExit('Pinned enforcement logging shape changed; review required')
s=s.replace(old,new);target.write_text(s);print('Applied connector-only structured logging privacy patch.')
