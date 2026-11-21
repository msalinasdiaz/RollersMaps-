export type RouteCoordinate = { latitude: number; longitude: number; segment?: number };
function valid(point: RouteCoordinate) { return Number.isFinite(point.latitude) && Number.isFinite(point.longitude) && Math.abs(point.latitude)<=90 && Math.abs(point.longitude)<=180; }
export function splitRoute<T extends RouteCoordinate>(route: T[]): T[][] {
  const result: T[][] = [];
  for (const point of route) {
    const last = result.at(-1);
    if (!valid(point)) { result.push([]); continue; }
    if (!last?.length || (last.at(-1)?.segment ?? 0) !== (point.segment ?? 0)) result.push([point]);
    else last.push(point);
  }
  return result;
}
export function hasRouteGeometry(route: RouteCoordinate[]) {
  let previous: RouteCoordinate | null=null;
  for(const point of route) { if(!valid(point)){previous=null;continue;} if(previous && (previous.segment??0)===(point.segment??0))return true;previous=point; }
  return false;
}
export function routeGeometry(route: RouteCoordinate[]) {
  const lines = splitRoute(route).filter(line => line.length > 1).map(line => line.map(p => [p.longitude, p.latitude]));
  if (!lines.length) return null;
  return lines.length === 1 ? { type: 'LineString' as const, coordinates: lines[0] } : { type: 'MultiLineString' as const, coordinates: lines };
}
export function parseRouteGeometry(value: unknown): RouteCoordinate[] {
  if (!value || typeof value !== 'object' || !('type' in value) || !('coordinates' in value) || !Array.isArray(value.coordinates)) return [];
  const lines = value.type === 'MultiLineString' ? value.coordinates : value.type === 'LineString' ? [value.coordinates] : [];
  const result:RouteCoordinate[]=[];
  let segment=0;
  for(const line of lines) {
    if(!Array.isArray(line)){segment++;continue;}
    let interrupted=false;
    for(const p of line) {
      if(!Array.isArray(p) || p.length<2 || !Number.isFinite(p[0]) || !Number.isFinite(p[1]) || Math.abs(p[0])>180 || Math.abs(p[1])>90){interrupted=result.length>0;continue;}
      if(interrupted){segment++;interrupted=false;}
      result.push({longitude:p[0],latitude:p[1],segment});
    }
    segment++;
  }
  return result;
}
export function routeBounds(route: RouteCoordinate[]): [number, number, number, number] {
  let west=180, east=-180, south=90, north=-90;
  for (const p of route) { if(!valid(p))continue;west=Math.min(west,p.longitude);east=Math.max(east,p.longitude);south=Math.min(south,p.latitude);north=Math.max(north,p.latitude); }
  if(west>east)return [-70.66,-33.44,-70.64,-33.42];
  const x=Math.max((east-west)*.12,.001), y=Math.max((north-south)*.12,.001);
  return [Math.max(-180,west-x),Math.max(-90,south-y),Math.min(180,east+x),Math.min(90,north+y)];
}
function metersBetween(a:RouteCoordinate,b:RouteCoordinate) {
  const rad=Math.PI/180;
  const h=Math.sin((b.latitude-a.latitude)*rad/2)**2+Math.cos(a.latitude*rad)*Math.cos(b.latitude*rad)*Math.sin((b.longitude-a.longitude)*rad/2)**2;
  return 6371000*2*Math.asin(Math.sqrt(Math.max(0,Math.min(1,h))));
}
export function trimRouteForSharing<T extends RouteCoordinate>(route:T[],privacyRadiusMeters=200):T[] {
  const start=route.find(valid),finish=route.findLast(valid);
  if(!start || !finish)return [];
  const radius=Math.max(0,privacyRadiusMeters),result:T[]=[];
  let previousSegment:number|undefined,segment=-1,gap=true;
  for(const point of route) {
    if(!valid(point) || metersBetween(start,point)<radius || metersBetween(finish,point)<radius){gap=true;continue;}
    if(gap || previousSegment!==(point.segment??0))segment++;
    result.push({...point,segment});previousSegment=point.segment??0;gap=false;
  }
  return result;
}
function simplifyLine<T extends RouteCoordinate>(line:T[],tolerance:number):T[] {
  if(line.length<3)return line;
  if(line.length>2048) {
    const result:T[]=[];
    for(let i=0;i<line.length-1;i+=2047){const chunk=simplifyLine(line.slice(i,i+2048),tolerance);result.push(...(i?chunk.slice(1):chunk));}
    return result;
  }
  const keep=new Uint8Array(line.length);keep[0]=1;keep[line.length-1]=1;
  const pending:[number,number][]=[[0,line.length-1]],threshold=tolerance*tolerance;
  while(pending.length) {
    const [first,last]=pending.pop()!;const a=line[first],b=line[last],scale=Math.cos((a.latitude+b.latitude)*Math.PI/360);
    const bx=(b.longitude-a.longitude)*111195*scale,by=(b.latitude-a.latitude)*111195,length=bx*bx+by*by;
    let max=threshold,index=-1;
    for(let i=first+1;i<last;i++) {
      const x=(line[i].longitude-a.longitude)*111195*scale,y=(line[i].latitude-a.latitude)*111195;
      const t=length?Math.max(0,Math.min(1,(x*bx+y*by)/length)):0,d=(x-t*bx)**2+(y-t*by)**2;
      if(d>max){max=d;index=i;}
    }
    if(index!==-1){keep[index]=1;pending.push([first,index],[index,last]);}
  }
  return line.filter((_,i)=>keep[i]);
}
export function simplifyRouteForDisplay<T extends RouteCoordinate>(route:T[],toleranceMeters=3,maxPoints=10000):T[] {
  const lines=splitRoute(route).filter(line=>line.length),limit=Math.max(2,maxPoints);
  let tolerance=Math.max(.5,toleranceMeters),result=lines.flatMap(line=>simplifyLine(line,tolerance));
  // Bound rendering work without deleting original recording data or joining pauses.
  for(let i=0;result.length>limit && i<8;i++){tolerance*=2;result=lines.flatMap(line=>simplifyLine(line,tolerance));}
  return result;
}
