"""Fixture-only MCP marker provider. Durable journal is independent of app receipts."""
import http.server,json,os,pathlib,threading,time,socket
root=pathlib.Path('/sandbox-results');root.mkdir(exist_ok=True)
key=os.environ['SANDBOX_BEARER'];lock=threading.Lock()
class Handler(http.server.BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_POST(self):
  if self.path!='/mcp' or self.headers.get('Authorization')!='Bearer '+key or self.headers.get('X-Api-Key')!=key:
   self.send_error(403);return
  size=int(self.headers.get('Content-Length','0'))
  if not 0<size<=8192:self.send_error(400);return
  body=json.loads(self.rfile.read(size));args=body['params']['arguments']
  assert body['method']=='tools/call' and body['params']['name']=='create_marker'
  assert set(args)=={'marker','mode'} and args['mode'] in ['ok','drop','delay','cancel','persistfail']
  row={'marker':args['marker'],'mode':args['mode'],'created':True,'request_id':body['id']}
  with lock:
   with (root/'effects.jsonl').open('a') as f:f.write(json.dumps(row)+'\n');f.flush();os.fsync(f.fileno())
  if args['mode']=='drop':self.connection.shutdown(socket.SHUT_RDWR);self.connection.close();return
  if args['mode']=='delay':time.sleep(20)
  if args['mode']=='cancel':time.sleep(2)
  output=json.dumps({'jsonrpc':'2.0','id':body['id'],'result':{'structuredContent':{'marker':args['marker'],'created':True}}}).encode()
  self.send_response(200);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(output)));self.end_headers()
  try:self.wfile.write(output)
  except (BrokenPipeError,ConnectionResetError):pass
http.server.ThreadingHTTPServer(('127.0.0.1',18380),Handler).serve_forever()
