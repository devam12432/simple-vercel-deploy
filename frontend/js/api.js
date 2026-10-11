(() => {
  const apiBase = String(window.API_BASE_URL || '/api').replace(/\/$/, '');
  const request = async (path, options = {}) => {
    let response;
    try {
      response = await fetch(`${apiBase}${path}`, {headers:{'Content-Type':'application/json',...(options.headers||{})},...options});
    } catch (_) { throw new Error('Unable to connect to server. Make sure the simulator is running.'); }
    const data = await response.json().catch(()=>({error:'The server returned an unreadable response.'}));
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
    return data;
  };
  window.API = {
    get:(path)=>request(path),
    post:(path,body={})=>request(path,{method:'POST',body:JSON.stringify(body)}),
    put:(path,body={})=>request(path,{method:'PUT',body:JSON.stringify(body)}),
    delete:(path)=>request(path,{method:'DELETE'}),
    state:()=>request('/state'),
    positions:()=>request('/positions'),
    holdings:()=>request('/holdings'),
    report:()=>request('/reports/pnl')
  };
})();
