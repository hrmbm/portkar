const tidy = value => String(value || '').replace(/\s+/g, ' ').replace(/^\s*[:：\-]+\s*/, '').replace(/[;,]+$/, '').trim();
const title = value => tidy(value).toLowerCase().replace(/\b\p{L}/gu, c => c.toUpperCase());

function linesOf(text){
  return String(text || '').split(/\r?\n/).map(x => x.replace(/[|]/g,' ').replace(/\s+/g,' ').trim()).filter(Boolean);
}
function afterLabel(lines, pattern, stopPatterns=[]){
  for(let i=0;i<lines.length;i++){
    const line=lines[i];
    const match=line.match(pattern);
    if(!match) continue;
    const rest=tidy(line.slice(match.index + match[0].length));
    if(rest) return rest;
    for(let j=i+1;j<lines.length;j++){
      if(stopPatterns.some(rx=>rx.test(lines[j]))) break;
      if(lines[j]) return tidy(lines[j]);
    }
  }
  return '';
}
function parseDateAndPlace(value){
  const match=String(value||'').match(/(.+?)[,\s]+(\d{1,2})[\s./-](\d{1,2})[\s./-](\d{4})/);
  if(!match) return {};
  const day=Number(match[2]),month=Number(match[3]),year=Number(match[4]);
  if(day<1||day>31||month<1||month>12||year<1900||year>new Date().getFullYear()) return {};
  const dt=new Date(year,month-1,day);
  if(dt.getFullYear()!==year||dt.getMonth()!==month-1||dt.getDate()!==day) return {};
  return {tempat_lahir:title(match[1]),tanggal_lahir:`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`};
}
function parseRtRw(lines){
  for(const line of lines){
    const m=line.match(/(?:RT\s*[/.-]?\s*RW|RT\s*\/\s*RW|RT\s*RW)\s*[:：=]?\s*(\d{1,3})\s*[/.-]\s*(\d{1,3})/i)
      || line.match(/^\s*(\d{1,3})\s*[/.-]\s*(\d{1,3})\s*$/);
    if(m) return {alamat_rt:m[1].padStart(3,'0'),alamat_rw:m[2].padStart(3,'0')};
  }
  return {};
}
function headingValue(lines, pattern){
  for(const line of lines){
    const m=line.match(pattern);
    if(m){const v=tidy(line.slice(m[0].length));if(v)return title(v);}
  }
  return '';
}
function detectAddressType(value){
  const v=tidy(value);
  const rules=[
    [/^(?:DSN\.?|DUSUN)\s*/i,'Dusun'],
    [/^(?:KAMP(?:UNG)?\.?)\s*/i,'Kampung'],
    [/^(?:JL\.?|JALAN)\s*/i,'Jalan'],
    [/^(?:PERUM(?:AHAN)?\.?|KOMPLEK(?:S)?|KOMPLEK PERUMAHAN)\s*/i,'Perumahan'],
    [/^(?:KOMP\.?|KOMPLEK(?:S)?)\s*/i,'Komplek'],
    [/^(?:LINGK(?:UNGAN)?\.?)\s*/i,'Lingkungan'],
    [/^(?:GG\.?|GANG)\s*/i,'Gang'],
    [/^(?:LOR(?:ONG)?\.?)\s*/i,'Lorong'],
    [/^BLOK\s*/i,'Blok'],
    [/^(?:APT\.?|APARTEMEN)\s*/i,'Apartemen']
  ];
  for(const [rx,type] of rules) if(rx.test(v)) return {alamat_tipe:type,alamat_jalan:tidy(v.replace(rx,''))};
  return {alamat_tipe:'',alamat_jalan:v};
}

/** Parses common KTP front-side text. Values remain editable in the application form. */
export function extractKtpText(text){
  const lines=linesOf(text);
  const all=lines.join('\n');
  const out={};
  const stop=[/TEMPAT\s*[/|]?\s*TGL/i,/JENIS\s*KELAMIN/i,/ALAMAT\b/i,/RT\s*[/.-]?\s*RW/i,/KEL\s*[/.-]?\s*DESA/i,/KECAMATAN/i,/AGAMA/i,/STATUS\s*PERKAWINAN/i,/PEKERJAAN/i,/KEWARGANEGARAAN/i,/BERLAKU/i];

  // The printed card can show NIK as "NIK", "NIK :" or a separated OCR line.
  const nikLine=all.match(/(?:NIK|NO\.?\s*KTP)\D{0,32}((?:\d[\s.\-]*){16,22})/i);
  let nik=nikLine?.[1]?.replace(/\D/g,'')||'';
  if(nik.length>16) nik=nik.slice(0,16);
  if(!/^\d{16}$/.test(nik)){
    for(const line of lines){const digits=line.replace(/\D/g,'');if(/^\d{16}$/.test(digits)){nik=digits;break;}}
  }
  if(/^\d{16}$/.test(nik)) out.nik=nik;

  const name=afterLabel(lines,/\bNAMA(?:\s+LENGKAP)?\b\s*[:：=]?/i,stop);
  if(name){
    const clean=title(name.replace(/[^\p{L}\s.'-]/gu,'')).slice(0,100);
    if(clean && !/^(TEMPAT|JENIS|ALAMAT)$/i.test(clean)) out.nama=clean;
  }

  const ttl=afterLabel(lines,/(?:TEMPAT\s*[/|]?\s*TGL\s*LAHIR|TEMPAT.*LAHIR|TGL\s*LAHIR|TTL)\s*[:：=]?/i,stop);
  Object.assign(out,parseDateAndPlace(ttl));

  const gender=all.match(/(?:JENIS\s*KELAMIN\s*[:：=]?\s*)?(LAKI[ -]?LAKI|PEREMPUAN)/i)?.[1]||'';
  if(/PEREMPUAN/i.test(gender)) out.gender='P';
  else if(/LAKI/i.test(gender)) out.gender='L';

  const addr=afterLabel(lines,/\bALAMAT\b\s*[:：=]?/i,stop);
  if(addr){
    const street=tidy(addr.replace(/\bRT\s*[/.-]?\s*RW\b.*$/i,''));
    Object.assign(out,detectAddressType(street));
  }
  Object.assign(out,parseRtRw(lines));

  const village=afterLabel(lines,/(?:KEL\s*[/.-]?\s*DESA|KELURAHAN|DESA)\s*[:：=]?/i,stop);
  if(village) out.alamat_desa=title(village);
  const kec=afterLabel(lines,/KECAMATAN\s*[:：=]?/i,stop);
  if(kec) out.alamat_kecamatan=title(kec);

  // Province and regency/city are printed in the top header of the card.
  const prov=headingValue(lines,/^\s*PROVINSI\s+/i) || headingValue(lines,/PROVINSI\s+/i);
  const kabLine=lines.find(x=>/\b(?:KABUPATEN|KOTA)\s+/i.test(x));
  if(prov) out.alamat_provinsi=prov;
  if(kabLine){
    const m=kabLine.match(/\b(KABUPATEN|KOTA)\s+(.+)$/i);
    if(m){out.alamat_kota_jenis=/^KOTA$/i.test(m[1])?'Kota':'Kabupaten';out.alamat_kota_nama=title(m[2]);}
  }

  const religion=afterLabel(lines,/AGAMA\s*[:：=]?/i,stop);
  if(religion){
    const map={'ISLAM':'Islam','KRISTEN':'Kristen Protestan','KRISTEN PROTESTAN':'Kristen Protestan','KATOLIK':'Katolik','HINDU':'Hindu','BUDDHA':'Buddha','BUDHA':'Buddha','KONGHUCU':'Konghucu'};
    out.agama=map[religion.toUpperCase()]||title(religion);
  }
  const status=afterLabel(lines,/STATUS\s*PERKAWINAN\s*[:：=]?/i,stop);
  if(status){
    if(/BELUM/i.test(status))out.status_kawin='Belum kawin';
    else if(/CERAI\s*MATI/i.test(status))out.status_kawin='Cerai mati';
    else if(/CERAI\s*HIDUP/i.test(status))out.status_kawin='Cerai hidup';
    else if(/KAWIN/i.test(status))out.status_kawin='Kawin';
  }
  const nationality=afterLabel(lines,/KEWARGANEGARAAN\s*[:：=]?/i,stop);
  if(nationality) out.warga_negara=/WNA|ASING/i.test(nationality)?'WNA':'WNI';
  else out.warga_negara='WNI';
  const blood=all.match(/GOL\.?\s*DARAH\s*[:：=]?\s*(A|B|AB|O)\b/i)?.[1];
  if(blood) out.gol_darah=blood.toUpperCase();
  return out;
}

/** Canonical address string used by the application and the PDF master. */
export function formatKtpAddress(data={}){
  const tidyPart=v=>tidy(v).replace(/[,;]+$/,'');
  const titlePart=v=>title(tidyPart(v));
  const parts=[];
  const street=tidyPart(data.alamat_jalan);
  const type=tidyPart(data.alamat_tipe);
  if(street){
    const legacy=street.match(/^(DSN\.?|DUSUN|JL\.?|JALAN|PERUM(?:AHAN)?\.?|KOMP\.?|KOMPLEK(?:S)?|GG\.?|GANG|BLOK)\s*(.*)$/i);
    const raw=legacy?legacy[2]:street;
    const prefixMap={'Dusun':'Dusun','Kampung':'Kampung','Jalan':'Jl.','Perumahan':'Perumahan','Komplek':'Komplek','Lingkungan':'Lingk.','Gang':'Gg.','Lorong':'Lorong','Blok':'Blok','Apartemen':'Apartemen'};
    const effective=type || (legacy ? (/^(DSN|DUSUN)/i.test(legacy[1])?'Dusun':/^(KAMP)/i.test(legacy[1])?'Kampung':/^(JL|JALAN)/i.test(legacy[1])?'Jalan':/^(PERUM)/i.test(legacy[1])?'Perumahan':/^(KOMP|KOMPLEK)/i.test(legacy[1])?'Komplek':/^(LINGK)/i.test(legacy[1])?'Lingkungan':/^(GG|GANG)/i.test(legacy[1])?'Gang':/^(LOR)/i.test(legacy[1])?'Lorong':/^(APT|APARTEMEN)/i.test(legacy[1])?'Apartemen':'Blok') : '');
    const prefix=prefixMap[effective]||'';
    parts.push(prefix?`${prefix} ${titlePart(raw)}`:titlePart(raw));
  }
  const rt=String(data.alamat_rt||'').replace(/\D/g,'').slice(0,3);
  const rw=String(data.alamat_rw||'').replace(/\D/g,'').slice(0,3);
  if(rt||rw) parts.push(`RT ${rt.padStart(3,'0')||'___'}/RW ${rw.padStart(3,'0')||'___'}`);
  if(data.alamat_desa){
    const areaType=data.alamat_wilayah_type==='Kelurahan'?'Kel.':data.alamat_wilayah_type==='Desa'?'Desa':'Desa/Kel.';
    parts.push(`${areaType} ${titlePart(data.alamat_desa)}`);
  }
  if(data.alamat_kecamatan) parts.push(`Kec. ${titlePart(data.alamat_kecamatan)}`);
  if(data.alamat_kota_nama) parts.push(`${data.alamat_kota_jenis==='Kota'?'Kota':'Kab. '} ${titlePart(data.alamat_kota_nama)}`.replace(/\s+/g,' ').trim());
  if(data.alamat_provinsi) parts.push(titlePart(data.alamat_provinsi));
  const postal=String(data.alamat_kodepos||'').replace(/\D/g,'').slice(0,5);
  if(postal) parts.push(postal);
  return parts.filter(Boolean).join(', ');
}
