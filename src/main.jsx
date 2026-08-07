import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import 'leaflet/dist/leaflet.css';
import { CircleMarker, MapContainer, Popup, TileLayer, Tooltip, useMap } from 'react-leaflet';
import { compressImageForFirestore, connectFirebase, firebaseEnabled, loadCloudData, publishDiscovery, saveCloudData, subscribePublicDiscoveries } from './firebase';
import orchiveLogo from './assets/orchive-logo.png';

// 샘플 데이터: Firebase 연결 전에는 이 배열만 수정해도 화면 내용이 바뀝니다.
const creatures = [
  { id: 1, name: '파란고리문어', latin: 'Hapalochlaena lunulata', type: '위험 생물', emoji: '🐙', image: 'https://images.unsplash.com/photo-1545671913-b89ac1b4ac10?auto=format&fit=crop&w=800&q=85', danger: 5, count: 15, place: '해운대해수욕장', time: '2시간 전', x: 76, y: 28 },
  { id: 2, name: '노무라입깃해파리', latin: 'Nemopilema nomurai', type: '해파리', emoji: '🪼', image: 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?auto=format&fit=crop&w=800&q=85', danger: 3, count: 28, place: '광안리해수욕장', time: '5시간 전', x: 52, y: 53 },
  { id: 3, name: '성게', latin: 'Mesocentrotus nudus', type: '기타', emoji: '🦔', image: 'https://images.unsplash.com/photo-1530053969600-caed2596d242?auto=format&fit=crop&w=800&q=85', danger: 2, count: 46, place: '송정해수욕장', time: '1일 전', x: 29, y: 69 },
  { id: 4, name: '쏠배감펭', latin: 'Pterois lunulata', type: '어류', emoji: '🐠', image: 'https://images.unsplash.com/photo-1546026423-cc4642628d2b?auto=format&fit=crop&w=800&q=85', danger: 3, count: 9, place: '다대포해수욕장', time: '2일 전', x: 38, y: 84 }
];
const navs = [['home','⌂','홈'], ['map','●','발견 지도'], ['register','▣','생물 등록'], ['book','▤','도감'], ['mypage','♙','마이페이지']];
const Stars = ({n}) => <span className="stars">{'★'.repeat(n)}<i>{'★'.repeat(5-n)}</i></span>;
// 실제 해수욕장 좌표입니다. 사용자가 입력한 위치 이름과 가장 가까운 해변에 표시합니다.
const beaches = [
  { name: '해운대해수욕장', shortName: '해운대', position: [35.1587, 129.1604] },
  { name: '광안리해수욕장', shortName: '광안리', position: [35.1532, 129.1186] },
  { name: '송정해수욕장', shortName: '송정', position: [35.1788, 129.1995] },
  { name: '일광해수욕장', shortName: '일광', position: [35.2611, 129.2337] },
  { name: '임랑해수욕장', shortName: '임랑', position: [35.3214, 129.2677] },
  { name: '다대포해수욕장', shortName: '다대포', position: [35.0482, 128.9660] }
];
const getPlacePosition = (place = '') => beaches.find(beach => place.includes(beach.shortName))?.position || beaches[0].position;
function MoveMap({position}) { const map=useMap(); useEffect(()=>{if(position) map.flyTo(position,15,{duration:.8})},[map,position]); return null; }
const avatarOptions = [
  { id:'wave', emoji:'🌊', name:'블루 웨이브', tier:'기본', cost:0 },
  { id:'dolphin', emoji:'🐬', name:'코랄 돌핀', tier:'기본', cost:0 },
  { id:'whale', emoji:'🐋', name:'오션 웨일', tier:'프리미엄', cost:50 },
  { id:'turtle', emoji:'🐢', name:'씨 터틀', tier:'프리미엄', cost:100 },
  { id:'coral', emoji:'🪸', name:'코랄 가든', tier:'레어', cost:150 },
  { id:'shark', emoji:'🦈', name:'딥 블루 샤크', tier:'레어', cost:250 },
  { id:'octopus', emoji:'🐙', name:'문라이트 옥토', tier:'레전드', cost:350 },
  { id:'mermaid', emoji:'🧜‍♀️', name:'씨 가디언', tier:'레전드', cost:500 },
  { id:'moon', emoji:'🌌', name:'미드나잇 블루', tier:'마스터', cost:700 },
  { id:'goat', emoji:'👑', name:'아비스 오버로드', tier:'GOAT', cost:1500 }
];
const badgeCatalog = [
  { icon:'📷', name:'첫 물결', description:'첫 생물 발견', unlocked:(_, discoveries)=>discoveries.length>=1 },
  { icon:'📍', name:'해안 발자국', description:'서로 다른 2곳 방문', unlocked:(_, discoveries)=>new Set(discoveries.map(item=>item.place)).size>=2 },
  { icon:'🛟', name:'해안 수호자', description:'위험 생물 기록', unlocked:(_, discoveries)=>discoveries.some(item=>item.danger>=4) },
  { icon:'🔭', name:'조류 기록가', description:'5회 발견 기록', unlocked:(_, discoveries)=>discoveries.length>=5 },
  { icon:'🪸', name:'산호 친구', description:'300 EXP 달성', unlocked:profile=>profile.exp>=300 },
  { icon:'🌙', name:'밤바다 관측자', description:'600 EXP 달성', unlocked:profile=>profile.exp>=600 },
  { icon:'🧭', name:'부산 항해사', description:'4곳 방문', unlocked:(_, discoveries)=>new Set(discoveries.map(item=>item.place)).size>=4 },
  { icon:'👑', name:'블루 마스터', description:'1,000 EXP 달성', unlocked:profile=>profile.exp>=1000 }
];
const hasBadge = (badge, profile, discoveries) => badge.unlocked(profile, discoveries);
const formatDiscoveryTime = item => {
  const createdAt = Number(item.createdAt);
  if (!createdAt) return item.time || '최근 발견';
  const minutes = Math.max(0, Math.floor((Date.now() - createdAt) / 60000));
  if (minutes < 1) return '방금 전';
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
};
// Firebase 연결 전에도 새로고침 후 기록이 사라지지 않도록 기기에 저장합니다.
function useSavedState(key, initialValue) {
  const [value, setValue] = useState(() => {
    try { const saved = localStorage.getItem(key); return saved ? JSON.parse(saved) : initialValue; }
    catch { return initialValue; }
  });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }, [key, value]);
  return [value, setValue];
}
const CreatureCard = ({item, compact=false}) => <article className={'creature-card '+(compact?'compact':'')}><img src={item.image} alt={item.name}/><div><div className="card-title">{item.danger>=4 && <b className="danger">위험</b>}{item.name}</div><small>{item.place} · {formatDiscoveryTime(item)}</small><Stars n={item.danger}/></div></article>;
function Header({title, back, action, onAction}) { return <header className="topbar">{back?<button className="plain" onClick={back}>‹</button>:<div className="brand"><span className="logo-mark"><img src={orchiveLogo} alt="Orchive 고래 로고"/></span><div>Orchive<small>부산 바다 생물 도감</small></div></div>}<h2>{title}</h2>{action&&<button className="plain" onClick={onAction}>{action}</button>}</header> }
function Home({go, profile, discoveries}) { const level=Math.floor(profile.exp/300); const regions=new Set(discoveries.map(x=>x.place)).size; return <><Header/><section className="profile"><div className="avatar">{profile.avatar}<b>Lv. {level}</b></div><div><h3>{profile.name} ✎</h3><p>다음 레벨까지 <b>{300-(profile.exp%300)} EXP!</b></p><div className="progress"><i style={{width:(profile.exp%300)/3+'%'}}/></div><small>{profile.exp % 300} / 300 EXP</small></div><span>›</span></section><section className="badge-box"><div className="section-head"><b>내 배지 컬렉션</b><button onClick={()=>go('mypage')}>전체 보기 ›</button></div><div className="badges">{badgeCatalog.slice(0,4).map(badge=><div className={hasBadge(badge,profile,discoveries)?'':'locked'} title={badge.description}><span>{badge.icon}</span><small>{badge.name}</small></div>)}</div></section><div className="stats">{[[discoveries.length,'발견 기록'],[regions,'방문 지역'],[profile.exp,'누적 EXP']].map(([v,n])=><div><strong>{v}</strong><small>{n}</small></div>)}</div><div className="quick">{[['▣','발견 등록','register'],['●','발견 지도','map'],['▤','해양 생물 도감','book'],['!','위험 생물 안내','book']].map(([i,n,p])=><button onClick={()=>go(p)}><b>{i}</b><small>{n}</small></button>)}</div><section className="panel"><div className="section-head"><b>나의 최근 발견</b><button onClick={()=>go('book')}>도감 보기 ›</button></div>{discoveries.length?discoveries.slice(0,3).map(x=><CreatureCard item={x} compact/>):<div className="mini-empty">아직 등록된 발견이 없어요. 첫 생물을 기록해 보세요!</div>}</section></> }
function MapPage({discoveries}){const [filter,setFilter]=useState('전체');const [searchOpen,setSearchOpen]=useState(false);const [query,setQuery]=useState('');const [target,setTarget]=useState(null);const types=['전체','위험 생물','해파리','연체동물','어류'];const shown=filter==='전체'?discoveries:discoveries.filter(x=>x.type===filter);const matches=beaches.filter(beach=>beach.name.includes(query.trim()));const moveTo=beach=>{setTarget(beach);setQuery(beach.name);setSearchOpen(false)};return <><Header title="발견 지도" action="⌕" onAction={()=>setSearchOpen(old=>!old)}/>{searchOpen&&<div className="map-search"><input autoFocus value={query} onChange={event=>setQuery(event.target.value)} placeholder="해수욕장 이름 검색"/>{matches.length?matches.map(beach=><button key={beach.name} onClick={()=>moveTo(beach)}>📍 {beach.name}</button>):<p>찾는 해수욕장이 없어요.</p>}</div>}<div className="chips">{types.map(t=><button className={filter===t?'active':''} onClick={()=>setFilter(t)}>{t}</button>)}</div><div className="map-wrap"><MapContainer center={[35.163,129.151]} zoom={13} minZoom={10} scrollWheelZoom className="real-map"><MoveMap position={target?.position}/><TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"/>{beaches.map(beach=><CircleMarker key={beach.name} center={beach.position} radius={5} pathOptions={{color:'#0d73dd',fillColor:'#55c9ef',fillOpacity:1,weight:2}} eventHandlers={{click:()=>moveTo(beach)}}><Tooltip permanent direction="top" offset={[0,-7]} className="beach-label">{beach.name}</Tooltip></CircleMarker>)}{shown.map(item=><CircleMarker key={item.id} center={getPlacePosition(item.place)} radius={item.danger>=4?15:12} pathOptions={{color:'#fff',fillColor:item.danger>=4?'#ef4b4b':'#146de1',fillOpacity:1,weight:3}}><Tooltip direction="top" offset={[0,-8]}>{item.emoji||'🐚'}</Tooltip><Popup><div className="map-popup"><b>{item.name}</b><small>{item.place} · {formatDiscoveryTime(item)}</small><Stars n={item.danger}/></div></Popup></CircleMarker>)}</MapContainer><p className="map-help">오른쪽 위 돋보기로 해수욕장을 검색하거나, 지도를 드래그·확대해 볼 수 있어요.</p></div><section className="panel recent"><div className="section-head"><b>최근 발견</b><small>시민이 공유한 모든 기록</small></div>{shown.length?shown.map(x=><CreatureCard key={x.id} item={x} compact/>):<div className="mini-empty">아직 지도에 표시할 발견 기록이 없어요.</div>}</section></>}
function Register({go,setDraft}){const file=useRef();const [photo,setPhoto]=useState(null);const [imageData,setImageData]=useState(null);const [place,setPlace]=useState(beaches[0].name);const [loading,setLoading]=useState(false);const [error,setError]=useState('');const choose=e=>{const f=e.target.files[0];if(!f)return;setPhoto(URL.createObjectURL(f));const reader=new FileReader();reader.onload=event=>setImageData(event.target.result);reader.readAsDataURL(f)};const startAnalysis=async()=>{if(!imageData){setError('먼저 생물 사진을 올려주세요.');return}setLoading(true);setError('');try{const apiBase=window.location.hostname.endsWith('github.io')?'https://orchive-busan-sea-web.vercel.app':'';const response=await fetch(`${apiBase}/api/analyze`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({imageData,place})});const result=await response.json();if(!response.ok)throw new Error(result.error||'AI 분석에 실패했습니다.');setDraft({photo:imageData,place,analysis:result,date:new Date().toISOString().slice(0,10)});go('analysis')}catch(err){setError(err.message)}finally{setLoading(false)}};return <><Header title="생물 발견 등록" back={()=>go('home')}/><main className="form-page"><button className="upload" onClick={()=>file.current.click()}>{photo?<img src={photo}/>:<><b>＋</b><span>발견한 생물 사진을 올려주세요</span><small>사진 선택하기</small></>}</button><input ref={file} type="file" accept="image/*" hidden onChange={choose}/><div className="ai-tip">✦ 사진을 올리면 실제 AI가 생물 이름과 위험도를 분석해 드려요.</div><label className="field">발견 위치</label><div className="beach-picker">{beaches.map(beach=><button type="button" key={beach.name} className={place===beach.name?'selected-beach':''} onClick={()=>setPlace(beach.name)}>📍 {beach.name}</button>)}</div>{error&&<p className="form-error">{error}</p>}<button className="primary" disabled={loading} onClick={startAnalysis}>{loading?'AI가 사진을 분석하고 있어요…':'AI 분석 시작하기 ✦'}</button></main></>}
function Analysis({go,draft,setDraft,onRegister}){const [confirmed,setConfirmed]=useState(false);const [loading,setLoading]=useState(false);const [error,setError]=useState('');const detected=draft.analysis;const isDanger=detected?.danger>=4;const isMarine=detected?.isMarine!==false;const reanalyze=async()=>{if(!draft.photo)return;setLoading(true);setError('');setConfirmed(false);try{const apiBase=window.location.hostname.endsWith('github.io')?'https://orchive-busan-sea-web.vercel.app':'';const response=await fetch(`${apiBase}/api/analyze`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({imageData:draft.photo,place:draft.place,retry:true,previousName:detected?.name})});const result=await response.json();if(!response.ok)throw new Error(result.error||'AI 재분석에 실패했습니다.');setDraft(old=>({...old,analysis:result}))}catch(err){setError(err.message)}finally{setLoading(false)}};if(!detected)return <><Header title="AI 분석 결과" back={()=>go('register')}/><main className="analysis"><h2>분석 결과가 없습니다.</h2><button className="primary" onClick={()=>go('register')}>사진 다시 등록하기</button></main></>;return <><Header title="AI 분석 결과" back={()=>go('register')}/><main className="analysis"><img className="round-photo" src={draft.photo||creatures[0].image}/><h1>{detected.name}</h1><i>{detected.latin}</i><b className={isDanger?'danger':'ai-type'}>{detected.type}</b><p>AI 분석 위험도 <Stars n={detected.danger}/></p><div className="confidence"><small>AI 분석 신뢰도</small><strong>{detected.confidence}%</strong><div className="progress"><i style={{width:detected.confidence+'%'}}/></div></div><div className="feature"><b>AI가 발견한 특징</b><p>✓ {detected.note}</p><p>✓ 발견 위치와 사진 정보를 함께 기록해요</p><p>✓ 시민 발견 데이터로 도감에 추가됩니다</p></div>{error&&<p className="form-error">{error}</p>}{!isMarine?<div className="non-marine"><b>도감 저장 제한</b><p>AI가 해양 생물이 아닌 사진으로 판단했어요. 이 사진은 도감에 저장되지 않습니다.</p><button className="secondary" onClick={reanalyze} disabled={loading}>{loading?'AI가 다시 확인 중이에요…':'그래도 해양 생물이에요 · 재분석'}</button></div>:<div className="ai-confirm"><b>AI 분석 결과가 맞나요?</b><p>시민 확인 기록은 도감의 신뢰도를 높여요.</p><div><button className={confirmed?'confirm-selected':''} onClick={()=>setConfirmed(true)}>✓ 맞아요</button><button onClick={reanalyze} disabled={loading}>{loading?'재분석 중…':'↻ 다른 생물이에요 · 다시 분석'}</button></div></div>}{isDanger&&<div className="warning"><b>🛡 주의하세요!</b><p>AI가 위험 가능성이 있는 생물로 분류했어요. 절대 만지지 말고 주변에 알려주세요.</p></div>}{isMarine?<button className="primary" disabled={!confirmed||loading} onClick={onRegister}>{confirmed?'이 정보로 등록하기':'먼저 AI 결과를 확인해 주세요'}</button>:<button className="primary" onClick={()=>go('register')}>다른 사진 선택하기</button>}</main></>}
function Complete({go,draft}){const item=draft.registered||{...creatures[0],place:draft.place||creatures[0].place,time:'방금 전'};return <><Header title="발견 등록 완료!" back={()=>go('home')}/><main className="complete"><div className="confetti">✦　✦　✦</div><div className="check">✓</div><h1>발견 등록 완료!</h1><p>소중한 발견이 나의 해양 생물 도감에 기록되었어요.</p><CreatureCard item={item}/><div className="reward"><span>🏅</span><b>{draft.isFirst?'첫 발견 배지 획득!':'발견 기록이 업데이트됐어요!'}</b><strong>+{draft.earned||100} EXP</strong></div><button className="primary" onClick={()=>go('book')}>내 도감에서 확인하기</button><button className="secondary" onClick={()=>go('register')}>계속 다른 생물 등록하기</button></main></>}
function CommunityActions({item,likes,setLikes,comments,setComments,profile}){const [text,setText]=useState('');const itemComments=comments[item.id]||[];const liked=likes[item.id]?.includes(profile.id);const toggleLike=()=>setLikes(old=>{const current=old[item.id]||[];return {...old,[item.id]:liked?current.filter(id=>id!==profile.id):[...current,profile.id]}});const addComment=()=>{if(!text.trim())return;setComments(old=>({...old,[item.id]:[...(old[item.id]||[]),{id:Date.now(),author:profile.name,text:text.trim()}]}));setText('')};return <div className="community"><button className={liked?'liked':''} onClick={toggleLike}>♥ 도움돼요 {likes[item.id]?.length||0}</button><div className="comment-list">{itemComments.map(comment=><p><b>{comment.author}</b> {comment.text}</p>)}</div><div className="comment-entry"><input value={text} maxLength="50" placeholder="관찰 댓글 남기기" onChange={e=>setText(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addComment()}/><button onClick={addComment}>등록</button></div></div>}
function Book({discoveries,likes,setLikes,comments,setComments,profile}){const [q,setQ]=useState('');const [f,setF]=useState('전체');const result=useMemo(()=>discoveries.filter(x=>(f==='전체'||x.type===f)&&x.name.includes(q)),[q,f,discoveries]);return <><Header title="나의 해양 생물 도감"/><div className="search">⌕<input value={q} placeholder="생물 이름을 검색하세요" onChange={e=>setQ(e.target.value)}/></div><div className="chips bookchips">{['전체','해파리','연체동물','어류','기타'].map(t=><button className={f===t?'active':''} onClick={()=>setF(t)}>{t}</button>)}</div><main className="book-grid">{result.length?result.map(x=><article className="book-card"><img src={x.image}/><div><span className={'trust-badge '+(x.verification==='시민 확인'?'confirmed':'')}>{x.verification||'AI 추정'}</span><h3>{x.name}</h3><i>{x.latin}</i><p><Stars n={x.danger}/> 발견 {x.count}회</p><small>최근 발견 · {x.place}</small><CommunityActions item={x} likes={likes} setLikes={setLikes} comments={comments} setComments={setComments} profile={profile}/></div></article>):<div className="empty-book"><span>🐚</span><h3>아직 발견한 생물이 없어요</h3><p>생물을 등록하면 나만의 도감에 추가돼요.</p></div>}</main></>}
function MyPage({profile,setProfile,discoveries,darkMode,setDarkMode}){const [editing,setEditing]=useState(false);const [draftName,setDraftName]=useState(profile.name);const level=Math.floor(profile.exp/300);const regions=new Set(discoveries.map(x=>x.place)).size;const nameChanges=profile.nameChanges||0;const nameCost=nameChanges===0?0:50;const owned=profile.unlockedAvatars||['wave','dolphin'];const saveName=()=>{const nextName=draftName.trim();if(!nextName){window.alert('이름을 입력해 주세요.');return}if(nextName===profile.name){setEditing(false);return}if(profile.exp<nameCost){window.alert(`이름 변경에는 ${nameCost} EXP가 필요해요.`);return}if(nameCost&& !window.confirm(`이름을 바꾸면 ${nameCost} EXP를 사용할까요?`))return;setProfile({...profile,name:nextName,exp:profile.exp-nameCost,nameChanges:nameChanges+1});setEditing(false)};const pickAvatar=option=>{const unlocked=owned.includes(option.id)||profile.avatar===option.emoji;if(unlocked){setProfile({...profile,avatar:option.emoji});return}if(profile.exp<option.cost){window.alert(`${option.cost} EXP가 필요해요.`);return}if(!window.confirm(`${option.name} 프로필을 ${option.cost} EXP로 잠금 해제할까요?`))return;setProfile({...profile,exp:profile.exp-option.cost,avatar:option.emoji,unlockedAvatars:[...owned,option.id]})};return <><Header title="마이페이지" action={darkMode?'☀':'☾'} onAction={()=>setDarkMode(old=>!old)}/><main className="my"><div className="myhero"><div className="theme-status"><span>{darkMode?'다크 모드':'라이트 모드'}</span><small>버튼을 눌러 테마 전환</small></div><div className="avatar">{profile.avatar}<b>Lv. {level}</b></div>{editing?<input autoFocus className="name-input" value={draftName} maxLength="12" onChange={e=>setDraftName(e.target.value)}/>:<h2>{profile.name}</h2>}<p>부산 바다를 기록하는 시민 과학자</p><div className="progress"><i style={{width:(profile.exp%300)/3+'%'}}/></div><small>{profile.exp%300} / 300 EXP · 다음 레벨까지 {300-(profile.exp%300)} EXP</small><button className="edit-profile" onClick={()=>editing?saveName():(setDraftName(profile.name),setEditing(true))}>{editing?`저장 ${nameCost?`· ${nameCost} EXP`:''}`:'이름·프로필 수정'}</button>{editing&&<p className="name-cost">{nameChanges===0?'첫 이름 변경은 무료예요!':'이후 이름 변경은 50 EXP가 사용돼요.'}</p>}</div><div className="stats">{[[discoveries.length,'발견'],[regions,'지역'],[level,'레벨']].map(([v,n])=><div><strong>{v}</strong><small>{n}</small></div>)}</div><section className="panel profile-studio"><div className="section-head"><b>프로필 스튜디오</b><small>보유 EXP {profile.exp}</small></div><p className="studio-copy">프로필을 고르고, 잠긴 스타일은 EXP로 잠금 해제해 보세요.</p><div className="avatar-gallery">{avatarOptions.map(option=>{const unlocked=owned.includes(option.id)||profile.avatar===option.emoji;const selected=profile.avatar===option.emoji;return <button key={option.id} className={`avatar-option ${option.tier==='GOAT'?'goat-avatar':''} ${selected?'selected':''} ${unlocked?'':'locked-avatar'}`} onClick={()=>pickAvatar(option)}><span>{option.emoji}</span><b>{option.name}</b><small>{unlocked?(selected?'사용 중':'보유'):`🔒 ${option.cost} EXP`}</small><em>{option.tier}</em></button>})}</div></section><section className="panel"><div className="section-head"><b>나의 획득 배지</b><small>{badgeCatalog.filter(badge=>hasBadge(badge,profile,discoveries)).length}/{badgeCatalog.length}</small></div><div className="badges white badge-grid">{badgeCatalog.map(badge=><div className={hasBadge(badge,profile,discoveries)?'':'locked'} title={badge.description}><span>{badge.icon}</span><small>{badge.name}</small><em>{badge.description}</em></div>)}</div></section><section className="panel"><b>EXP 획득 방법</b><p className="xp">첫 발견 <strong>+200 EXP</strong></p><p className="xp">두 번째부터 발견 등록 <strong>+100 EXP</strong></p><p className="xp">새로운 지역 발견 <strong>+50 EXP</strong></p><p className="xp">희귀 생물 발견 <strong>+200 EXP</strong></p></section></main></>}
function App(){
  // Firebase 연결 전에는 브라우저 저장소에 보관합니다. 새로고침해도 유지됩니다.
  const [page,setPage]=useState('home');
  const [draft,setDraft]=useState({});
  const [profile,setProfile]=useSavedState('orchive-profile',{id:'local-citizen',name:'새로운 탐험가',avatar:'🌊',exp:0});
  const [darkMode,setDarkMode]=useSavedState('orchive-dark-mode',false);
  const [discoveries,setDiscoveries]=useSavedState('orchive-discoveries',[]);
  const [likes,setLikes]=useSavedState('orchive-likes',{});
  const [comments,setComments]=useSavedState('orchive-comments',{});
  const [cloudUser,setCloudUser]=useState(null);
  const [cloudReady,setCloudReady]=useState(false);
  const [publicDiscoveries,setPublicDiscoveries]=useState([]);
  useEffect(()=>{if(!profile.id)setProfile(old=>({...old,id:'local-citizen'}))},[]);
  // Firebase 설정이 들어 있으면 익명 로그인 후 클라우드 데이터를 불러옵니다.
  useEffect(()=>{let active=true;if(!firebaseEnabled)return;connectFirebase().then(async uid=>{const cloud=await loadCloudData(uid);if(!active)return;if(cloud?.profile)setProfile(cloud.profile);if(cloud?.discoveries)setDiscoveries(cloud.discoveries);if(cloud?.likes)setLikes(cloud.likes);if(cloud?.comments)setComments(cloud.comments);setCloudUser(uid);setCloudReady(true)}).catch(error=>console.warn('Firebase 연결 실패',error));return()=>{active=false}},[]);
  useEffect(()=>{if(cloudUser&&cloudReady)saveCloudData(cloudUser,{profile,discoveries,likes,comments}).catch(error=>console.warn('Firebase 저장 실패',error))},[cloudUser,cloudReady,profile,discoveries,likes,comments]);
  useEffect(()=>firebaseEnabled?subscribePublicDiscoveries(setPublicDiscoveries):undefined,[]);
  const registerDiscovery=async()=>{
    const analysis=draft.analysis;
    if (!analysis || analysis.isMarine===false) return;
    let savedPhoto;
    try {
      // 개인 기록과 공개 기록 모두 Firestore 문서 크기 제한 안에 들어가도록 먼저 압축합니다.
      savedPhoto=await compressImageForFirestore(draft.photo||creatures.find(x=>x.name===analysis.name)?.image||creatures[0].image);
    } catch (error) {
      window.alert(error.message||'사진을 준비하지 못했습니다. 다른 사진으로 다시 시도해 주세요.');
      return;
    }
    const name=analysis.name;
    const same=discoveries.find(x=>x.name===name);
    const isFirst=discoveries.length===0;
    const isNewPlace=!discoveries.some(x=>x.place===draft.place);
    // EXP rules: first discovery 200, every later registration 100,
    // plus 50 for a new place and 200 when Gemini marks it as rare.
    const baseExp=isFirst?200:100;
    const regionExp=isNewPlace?50:0;
    const rareExp=analysis.rare===true?200:0;
    const earned=baseExp+regionExp+rareExp;
    const item={id:Date.now(),name,latin:analysis.latin,type:analysis.type,emoji:analysis.emoji||'🐚',image:savedPhoto,danger:analysis.danger,count:1,place:draft.place||'해운대해수욕장',createdAt:Date.now(),time:'방금 전',verification:'시민 확인'};
    const saved=same?{...same,count:same.count+1,place:item.place,time:item.time,image:item.image}:item;
    setDiscoveries(old=>same?old.map(x=>x.name===name?saved:x):[saved,...old]);
    setProfile(old=>({...old,exp:old.exp+earned}));
    setDraft(old=>({...old,registered:saved,earned,isFirst}));
    setPage('complete');
    // 사진은 Storage에, 공개 기록은 Firestore에 저장해 다른 사용자 지도에도 표시합니다.
    if(cloudUser){try{const shared=await publishDiscovery(cloudUser,item);setDiscoveries(old=>old.map(x=>x.id===item.id?{...x,image:shared.image}:x));setDraft(old=>({...old,registered:{...saved,image:shared.image}}))}catch(error){console.warn('공개 발견 저장 실패',error)}}
  };
  let content={home:<Home go={setPage} profile={profile} discoveries={discoveries}/>,map:<MapPage discoveries={firebaseEnabled?publicDiscoveries:discoveries}/>,register:<Register go={setPage} setDraft={setDraft}/>,analysis:<Analysis go={setPage} draft={draft} setDraft={setDraft} onRegister={registerDiscovery}/>,complete:<Complete go={setPage} draft={draft}/>,book:<Book discoveries={discoveries} likes={likes} setLikes={setLikes} comments={comments} setComments={setComments} profile={profile}/>,mypage:<MyPage profile={profile} setProfile={setProfile} discoveries={discoveries} darkMode={darkMode} setDarkMode={setDarkMode}/>}[page];
  return <div className={'app '+(darkMode?'dark-mode':'')}><div className="shell">{content}{!['analysis','complete'].includes(page)&&<nav>{navs.map(([p,i,n])=><button className={page===p?'selected':''} onClick={()=>setPage(p)}><span>{i}</span><small>{n}</small></button>)}</nav>}</div></div>
};
createRoot(document.getElementById('root')).render(<App/>);
