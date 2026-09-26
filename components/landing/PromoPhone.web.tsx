import { useEffect, useRef, createElement } from 'react';

/**
 * PromoPhone — hero-ის ანიმირებული ტელეფონი (მხოლოდ web).
 * შეტყობინება → ჯავშანი → ვაუჩერი → ტურის დაწყება → GPS → რუკა.
 * თარიღი და საათი ნამდვილია (Asia/Tbilisi). ენა: ka / en / ru.
 */

type Lang = 'ka' | 'en' | 'ru';

const CSS = `
.kkm-demo{
  --kkm-brand:#0a0a0a;--kkm-gold:#EF9F27;--kkm-peach:#FAEEDA;
  --kkm-ink:#0a0a0a;--kkm-muted:#5c5c5c;--kkm-card:#ffffff;
  --kkm-bg:#fafafa;--kkm-line:#e8e8e8;
  display:flex;flex-direction:column;align-items:center;gap:18px;
  font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  -webkit-font-smoothing:antialiased;
}
.kkm-demo *,.kkm-demo *::before,.kkm-demo *::after{box-sizing:border-box}
.kkm-phone{position:relative;width:min(280px,72vw);aspect-ratio:280/576;background:#0a0a0a;border-radius:42px;padding:10px;
  box-shadow:0 48px 76px -44px rgba(60,42,12,.44),0 12px 28px -18px rgba(60,42,12,.22),0 0 0 1px rgba(255,255,255,.08) inset}
.kkm-notch{position:absolute;top:10px;left:50%;transform:translateX(-50%);width:92px;height:23px;background:#0a0a0a;border-radius:0 0 14px 14px;z-index:30}
.kkm-screen{position:absolute;inset:10px;border-radius:33px;overflow:hidden;background:var(--kkm-bg);color:var(--kkm-ink);text-align:left}
.kkm-status{position:absolute;top:0;left:0;right:0;height:34px;z-index:20;display:flex;align-items:center;justify-content:space-between;padding:0 17px;font-size:11px;font-weight:600}
.kkm-sig{display:flex;align-items:flex-end;gap:2px;height:9px}
.kkm-sig i{width:2.5px;background:currentColor;border-radius:1px;display:block}
.kkm-sig i:nth-child(1){height:3.5px}.kkm-sig i:nth-child(2){height:5.5px}
.kkm-sig i:nth-child(3){height:7px}.kkm-sig i:nth-child(4){height:9px}
.kkm-bat{width:20px;height:10px;border:1.3px solid currentColor;border-radius:3px;position:relative}
.kkm-bat::after{content:"";position:absolute;left:1.3px;top:1.3px;bottom:1.3px;width:10px;background:currentColor;border-radius:1px}
.kkm-status.kkm-on-dark{color:#fff}
.kkm-scene{position:absolute;inset:0;padding-top:34px;opacity:0;visibility:hidden;transform:translateY(12px);
  transition:opacity .45s ease,transform .5s cubic-bezier(.22,1,.36,1),visibility .45s}
.kkm-scene.kkm-live{opacity:1;visibility:visible;transform:none}
.kkm-pad{padding:11px 13px}
.kkm-appbar{display:flex;align-items:center;gap:9px;padding:7px 13px 11px}
.kkm-ic{width:29px;height:29px;border-radius:9px;flex:none;display:block;background:#fff;border:1px solid var(--kkm-line);object-fit:contain}
.kkm-appname{font-size:13.5px;font-weight:700}
.kkm-appsub{font-size:10px;color:var(--kkm-muted)}
.kkm-card{background:var(--kkm-card);border:1px solid var(--kkm-line);border-radius:14px;padding:12px}
.kkm-k{font-size:9.5px;letter-spacing:.04em;text-transform:uppercase;color:var(--kkm-muted)}
.kkm-v{font-size:13.5px;font-weight:600;margin-top:3px}
.kkm-split{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.kkm-row{display:flex;justify-content:space-between;gap:9px;padding:7px 0;border-bottom:1px solid var(--kkm-line)}
.kkm-row:last-child{border-bottom:0}
.kkm-row span:first-child{color:var(--kkm-muted);font-size:11.5px}
.kkm-row span:last-child{font-size:12.5px;font-weight:600}
.kkm-empty{display:grid;place-items:center;height:calc(100% - 72px);text-align:center;padding:0 30px;color:var(--kkm-muted);font-size:12.5px;line-height:1.5}
.kkm-empty i{display:block;width:44px;height:44px;border-radius:50%;border:1.5px dashed var(--kkm-line);margin:0 auto 12px}
.kkm-btn{height:42px;border-radius:999px;display:grid;place-items:center;font-size:13px;font-weight:600;background:var(--kkm-brand);color:#fff;transition:transform .18s ease}
.kkm-btn.kkm-press{transform:scale(.96)}
.kkm-btn-2{background:#fff;color:var(--kkm-muted);border:1px solid var(--kkm-line)}
.kkm-btns{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}
.kkm-tag{display:inline-flex;align-items:center;gap:6px;font-size:10.5px;font-weight:600;padding:5px 10px;border-radius:999px;background:var(--kkm-peach);color:#7a5410}
.kkm-tag i{width:6px;height:6px;border-radius:50%;background:var(--kkm-gold);display:block}
.kkm-notif{position:absolute;top:40px;left:10px;right:10px;z-index:25;background:rgba(255,255,255,.95);backdrop-filter:blur(14px);
  border:1px solid rgba(232,232,232,.95);border-radius:16px;padding:10px 11px;box-shadow:0 20px 36px -22px rgba(20,14,4,.42);
  display:flex;gap:9px;align-items:flex-start;transform:translateY(-140%);opacity:0;
  transition:transform .6s cubic-bezier(.2,1.1,.3,1),opacity .4s ease}
.kkm-notif.kkm-show{transform:none;opacity:1}
.kkm-notif.kkm-tapped{transform:scale(.96);opacity:0;transition:transform .3s ease,opacity .3s ease}
.kkm-notif .kkm-ic{width:31px;height:31px}
.kkm-nt{font-size:11.5px;font-weight:700;display:flex;justify-content:space-between;gap:8px}
.kkm-nt em{font-style:normal;font-weight:500;color:var(--kkm-muted);font-size:9.5px}
.kkm-nb{font-size:11.5px;line-height:1.35;margin-top:2px;display:block}
.kkm-vouch{background:var(--kkm-card);border:1px solid var(--kkm-line);border-radius:14px;overflow:hidden}
.kkm-vh{background:var(--kkm-brand);color:#fff;padding:11px 13px;display:flex;justify-content:space-between;align-items:center}
.kkm-vh b{font-size:12.5px}
.kkm-vh span{font-size:10px;color:var(--kkm-gold)}
.kkm-vb{padding:11px 13px}
.kkm-perf{height:12px;background:radial-gradient(circle at 6px 6px, transparent 5px, var(--kkm-line) 5px, var(--kkm-line) 6px, transparent 6px) repeat-x;background-size:12px 12px}
.kkm-qr{width:54px;height:54px;flex:none;border-radius:6px;background-image:linear-gradient(90deg,#0a0a0a 2px,transparent 2px),linear-gradient(0deg,#0a0a0a 2px,transparent 2px);background-size:7px 7px;background-color:#fff;border:1px solid var(--kkm-line);opacity:.85}
.kkm-splash{position:absolute;inset:0;z-index:26;background:#0a0a0a;display:grid;place-items:center;text-align:center;opacity:0;visibility:hidden;transition:opacity .45s ease,visibility .45s}
.kkm-splash.kkm-live{opacity:1;visibility:visible}
.kkm-sp-logo{width:90px;height:90px;border-radius:21px;background:#fff;padding:7px;display:block;margin:0 auto;object-fit:contain;
  transform:scale(.72);opacity:0;transition:transform .85s cubic-bezier(.2,1.3,.3,1),opacity .5s ease}
.kkm-splash.kkm-live .kkm-sp-logo{transform:none;opacity:1}
.kkm-sp-road{width:2.5px;height:0;margin:11px auto 0;border-radius:2px;background:linear-gradient(180deg,var(--kkm-gold),rgba(239,159,39,0));
  transition:height .75s cubic-bezier(.22,1,.36,1) .3s}
.kkm-splash.kkm-live .kkm-sp-road{height:38px}
.kkm-sp-t{color:#fff;font-size:18.5px;font-weight:700;margin-top:13px;letter-spacing:-.015em;line-height:1.32;padding:0 18px;
  opacity:0;transform:translateY(12px);transition:opacity .6s ease .62s,transform .7s cubic-bezier(.22,1,.36,1) .62s}
.kkm-splash.kkm-live .kkm-sp-t{opacity:1;transform:none}
.kkm-sp-s{color:var(--kkm-gold);font-size:11.5px;margin-top:9px;opacity:0;transition:opacity .6s ease .9s}
.kkm-splash.kkm-live .kkm-sp-s{opacity:1}
.kkm-gps{position:absolute;inset:0;z-index:22;display:grid;place-items:center;background:rgba(10,10,10,.87);backdrop-filter:blur(5px);color:#fff;text-align:center;opacity:0;visibility:hidden;transition:opacity .4s ease,visibility .4s}
.kkm-gps.kkm-live{opacity:1;visibility:visible}
.kkm-radar{position:relative;width:88px;height:88px;margin:0 auto 17px}
.kkm-radar i{position:absolute;inset:0;border-radius:50%;border:1.5px solid var(--kkm-gold);opacity:0;animation:kkmPing 2s ease-out infinite}
.kkm-radar i:nth-child(2){animation-delay:.66s}
.kkm-radar i:nth-child(3){animation-delay:1.32s}
.kkm-radar b{position:absolute;left:50%;top:50%;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;background:var(--kkm-gold);box-shadow:0 0 22px var(--kkm-gold)}
@keyframes kkmPing{0%{transform:scale(.25);opacity:.9}100%{transform:scale(1);opacity:0}}
.kkm-gps p{margin:0;font-size:13.5px;font-weight:600}
.kkm-gps small{display:block;margin-top:6px;font-size:11px;opacity:.6;padding:0 24px}
.kkm-map{position:absolute;inset:0;background:#f2efe9}
.kkm-map svg{position:absolute;inset:0;width:100%;height:100%}
.kkm-blk{fill:#e7e2d9}
.kkm-st{stroke:#fff;stroke-width:7;fill:none;stroke-linecap:round}
.kkm-st2{stroke:#fff;stroke-width:4;fill:none;stroke-linecap:round}
.kkm-rbg{stroke:rgba(239,159,39,.22);stroke-width:8;fill:none;stroke-linecap:round}
.kkm-route{stroke:var(--kkm-gold);stroke-width:5.5;fill:none;stroke-linecap:round}
.kkm-pin{fill:#fff;stroke:#0a0a0a;stroke-width:2}
.kkm-lbl{font:600 11px system-ui,sans-serif;fill:#575149}
.kkm-topbar{position:absolute;top:40px;left:10px;right:10px;z-index:6;background:rgba(255,255,255,.95);backdrop-filter:blur(10px);border-radius:13px;padding:9px 11px;box-shadow:0 12px 24px -18px rgba(20,14,4,.38);display:flex;align-items:center;gap:9px}
.kkm-dot{width:8px;height:8px;border-radius:50%;background:var(--kkm-gold);flex:none;animation:kkmBlink 1.8s ease-in-out infinite}
@keyframes kkmBlink{0%,100%{opacity:1}50%{opacity:.25}}
.kkm-sheet{position:absolute;left:0;right:0;bottom:0;z-index:6;background:#fff;border-radius:19px 19px 0 0;padding:11px 13px 17px;box-shadow:0 -12px 28px -20px rgba(20,14,4,.38)}
.kkm-grab{width:34px;height:4px;border-radius:2px;background:var(--kkm-line);margin:0 auto 10px}
.kkm-tri{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:10px}
.kkm-tri div{background:var(--kkm-bg);border:1px solid var(--kkm-line);border-radius:10px;padding:7px 8px}
.kkm-tri b{display:block;font-size:14px;font-weight:700;font-variant-numeric:tabular-nums}
.kkm-tri span{font-size:9px;color:var(--kkm-muted)}
.kkm-tap{position:absolute;width:40px;height:40px;border-radius:50%;z-index:40;pointer-events:none;margin:-20px 0 0 -20px;opacity:0;background:rgba(239,159,39,.22);border:1.5px solid rgba(239,159,39,.55)}
.kkm-tap.kkm-go{animation:kkmTap .65s ease-out}
@keyframes kkmTap{0%{opacity:0;transform:scale(.4)}35%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(1.5)}}
.kkm-cap{text-align:center;min-height:42px}
.kkm-cap b{display:block;font-size:14.5px;font-weight:600;color:#0a0a0a}
.kkm-cap span{font-size:12.5px;color:#5c5c5c}
.kkm-steps{display:flex;gap:6px;justify-content:center}
.kkm-steps i{width:19px;height:3px;border-radius:2px;background:#e4ded4;transition:background .35s}
.kkm-steps i.kkm-on{background:var(--kkm-gold)}
@media (prefers-reduced-motion: reduce){.kkm-demo *{animation-duration:.001ms !important;transition-duration:.001ms !important}}
`;

const LOGO = '/logo.webp';

const HTML = `
<div class="kkm-phone">
  <div class="kkm-notch"></div>
  <div class="kkm-screen">
    <div class="kkm-status" data-el="status">
      <span data-el="clock">00:00</span>
      <span style="display:flex;align-items:center;gap:6px">
        <span class="kkm-sig"><i></i><i></i><i></i><i></i></span>
        <span style="font-size:10px">5G</span><span class="kkm-bat"></span>
      </span>
    </div>

    <div class="kkm-scene kkm-live" data-scene="home">
      <div class="kkm-appbar">
        <img class="kkm-ic" src="${LOGO}" alt="" />
        <span><span class="kkm-appname">KEKE Manager</span>
        <span class="kkm-appsub" style="display:block" data-t="driverLine"></span></span>
      </div>
      <div class="kkm-empty"><span><i></i><span data-t="empty"></span></span></div>
    </div>

    <div class="kkm-scene" data-scene="booking">
      <div class="kkm-appbar" style="padding-bottom:5px">
        <span class="kkm-appname" data-t="bookingTitle"></span>
        <span class="kkm-tag" style="margin-left:auto"><i></i><span data-t="tagNew"></span></span>
      </div>
      <div class="kkm-pad" style="padding-top:2px">
        <div class="kkm-card">
          <div class="kkm-k" data-t="kRoute"></div>
          <div class="kkm-v" data-t="vRoute"></div>
          <div style="height:10px"></div>
          <div class="kkm-split">
            <div><div class="kkm-k" data-t="kDate"></div><div class="kkm-v" data-el="date"></div></div>
            <div><div class="kkm-k" data-t="kDepart"></div><div class="kkm-v">08:00</div></div>
          </div>
          <div style="height:10px"></div>
          <div class="kkm-split">
            <div><div class="kkm-k" data-t="kVehicle"></div><div class="kkm-v" data-t="vVehicle"></div></div>
            <div><div class="kkm-k" data-t="kPax"></div><div class="kkm-v" data-t="vPax"></div></div>
          </div>
        </div>
        <div style="height:10px"></div>
        <div class="kkm-card">
          <div class="kkm-row"><span data-t="kCompany"></span><span>Escapers Travel</span></div>
          <div class="kkm-row"><span data-t="kPrice"></span><span>280 ₾</span></div>
          <div class="kkm-row"><span data-t="kFuel"></span><span data-t="vFuel"></span></div>
        </div>
        <div class="kkm-btns">
          <div class="kkm-btn kkm-btn-2" data-t="decline"></div>
          <div class="kkm-btn" data-el="accept" data-t="accept"></div>
        </div>
      </div>
    </div>

    <div class="kkm-scene" data-scene="voucher">
      <div class="kkm-appbar" style="padding-bottom:5px">
        <span class="kkm-appname" data-t="voucherTitle"></span>
        <span class="kkm-tag" style="margin-left:auto"><i></i><span data-t="tagOk"></span></span>
      </div>
      <div class="kkm-pad" style="padding-top:2px">
        <div class="kkm-vouch">
          <div class="kkm-vh"><b data-t="voucherNo"></b><span data-el="vdate"></span></div>
          <div class="kkm-vb">
            <div class="kkm-row"><span data-t="kRoute"></span><span data-t="vRoute"></span></div>
            <div class="kkm-row"><span data-t="kDriver"></span><span data-t="vDriver"></span></div>
            <div class="kkm-row"><span data-t="kVehicle"></span><span>Mercedes Vito</span></div>
          </div>
          <div class="kkm-perf"></div>
          <div class="kkm-vb" style="display:flex;gap:11px;align-items:center">
            <span class="kkm-qr"></span>
            <span>
              <div class="kkm-k" data-t="kStatus"></div>
              <div class="kkm-v" data-t="vStatus"></div>
              <div class="kkm-appsub" style="margin-top:4px" data-t="pdfMade"></div>
            </span>
          </div>
        </div>
        <div style="height:12px"></div>
        <div class="kkm-btn" data-el="start" data-t="startBtn"></div>
      </div>
    </div>

    <div class="kkm-scene" data-scene="map">
      <div class="kkm-map">
        <svg viewBox="0 0 292 564" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <rect class="kkm-blk" x="12" y="66" width="78" height="94" rx="7"/>
          <rect class="kkm-blk" x="180" y="48" width="96" height="78" rx="7"/>
          <rect class="kkm-blk" x="20" y="244" width="68" height="108" rx="7"/>
          <rect class="kkm-blk" x="192" y="228" width="84" height="88" rx="7"/>
          <rect class="kkm-blk" x="32" y="412" width="88" height="84" rx="7"/>
          <rect class="kkm-blk" x="196" y="392" width="80" height="110" rx="7"/>
          <path class="kkm-st" d="M0 192h292M0 374h292"/>
          <path class="kkm-st2" d="M100 0v564M180 0v564"/>
          <path class="kkm-rbg" d="M58 508 C 110 472, 88 412, 136 368 S 212 292, 180 222 S 128 136, 188 76"/>
          <path class="kkm-route" data-el="route" d="M58 508 C 110 472, 88 412, 136 368 S 212 292, 180 222 S 128 136, 188 76"/>
          <circle class="kkm-pin" cx="58" cy="508" r="6"/>
          <text class="kkm-lbl" data-el="cityA" x="58" y="534" text-anchor="middle"></text>
          <circle class="kkm-pin" cx="188" cy="76" r="6"/>
          <text class="kkm-lbl" data-el="cityB" x="188" y="60" text-anchor="middle"></text>
          <g data-el="car">
            <ellipse cx="1" cy="3" rx="11" ry="15" fill="rgba(20,14,4,.18)"/>
            <rect x="-9.5" y="-17" width="19" height="34" rx="6" fill="#0a0a0a"/>
            <rect x="-9.5" y="-17" width="19" height="34" rx="6" fill="none" stroke="#fff" stroke-width="1.3"/>
            <rect x="-6.6" y="-13.6" width="13.2" height="7" rx="2.6" fill="#d8d4cc"/>
            <rect x="-6.6" y="7" width="13.2" height="6" rx="2.2" fill="#8c877e"/>
            <rect x="-7.4" y="-18.8" width="4.2" height="2.6" rx="1.3" fill="#EF9F27"/>
            <rect x="3.2" y="-18.8" width="4.2" height="2.6" rx="1.3" fill="#EF9F27"/>
            <text x="0" y="2" text-anchor="middle" fill="#EF9F27" style="font:700 5.2px system-ui,sans-serif;letter-spacing:.3px">KEKE</text>
          </g>
        </svg>
      </div>
      <div class="kkm-topbar">
        <span class="kkm-dot"></span>
        <span>
          <div style="font-size:12px;font-weight:600" data-t="mapT"></div>
          <div class="kkm-appsub" data-t="mapS"></div>
        </span>
      </div>
      <div class="kkm-sheet">
        <div class="kkm-grab"></div>
        <div style="display:flex;align-items:center;gap:9px">
          <img class="kkm-ic" src="${LOGO}" alt="" />
          <span>
            <div style="font-size:13px;font-weight:600" data-t="vDriver"></div>
            <div class="kkm-appsub">Mercedes Vito · AA-140-KK</div>
          </span>
        </div>
        <div class="kkm-tri">
          <div><b data-el="km">0</b><span data-t="lKm"></span></div>
          <div><b data-el="spd">0</b><span data-t="lSpd"></span></div>
          <div><b data-el="eta">2:40</b><span data-t="lEta"></span></div>
        </div>
      </div>
    </div>

    <div class="kkm-splash" data-el="splash">
      <div>
        <img class="kkm-sp-logo" src="${LOGO}" alt="KEKE Manager" />
        <div class="kkm-sp-road"></div>
        <div class="kkm-sp-t" data-t="splashT"></div>
        <div class="kkm-sp-s" data-t="splashS"></div>
      </div>
    </div>

    <div class="kkm-gps" data-el="gps">
      <div>
        <div class="kkm-radar"><i></i><i></i><i></i><b></b></div>
        <p data-t="gpsT"></p>
        <small data-t="gpsS"></small>
      </div>
    </div>

    <div class="kkm-notif" data-el="notif">
      <img class="kkm-ic" src="${LOGO}" alt="" />
      <span style="flex:1">
        <span class="kkm-nt">KEKE Manager <em data-t="now"></em></span>
        <span class="kkm-nb" data-el="notifBody"></span>
      </span>
    </div>

    <div class="kkm-tap" data-el="tap"></div>
  </div>
</div>
<div class="kkm-cap" data-el="cap"></div>
<div class="kkm-steps" data-el="steps"><i class="kkm-on"></i><i></i><i></i><i></i><i></i></div>
`;

const MONTHS: Record<Lang, string[]> = {
  ka: ['იანვარი','თებერვალი','მარტი','აპრილი','მაისი','ივნისი','ივლისი','აგვისტო','სექტემბერი','ოქტომბერი','ნოემბერი','დეკემბერი'],
  en: ['January','February','March','April','May','June','July','August','September','October','November','December'],
  ru: ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'],
};

// `caps` is the odd one out: every other entry is a plain string, so the
// intersection with Record<string, string> made the whole object unassignable.
type Dict = Record<string, string | string[][]> & { caps: string[][] };

const T: Record<Lang, Dict> = {
  ka: {
    driverLine: 'გიორგი მ. · მძღოლი',
    empty: 'ახალი ჯავშნები არ არის.<br>შეტყობინებას მიიღებ, როგორც კი გამოჩნდება.',
    now: 'ახლა',
    notif: 'ახალი ჯავშანი: თბილისი → ყაზბეგი, {d}, 08:00 · 280 ₾',
    bookingTitle: 'ჯავშნის მოთხოვნა', tagNew: 'ახალი',
    kRoute: 'მარშრუტი', vRoute: 'თბილისი → ყაზბეგი',
    kDate: 'თარიღი', kDepart: 'გასვლა',
    kVehicle: 'ტრანსპორტი', vVehicle: 'მინივენი',
    kPax: 'მგზავრი', vPax: '6 ადამიანი',
    kCompany: 'კომპანია', kPrice: 'ფასი', kFuel: 'საწვავი', vFuel: 'შედის ფასში',
    decline: 'უარი', accept: 'მიღება',
    voucherTitle: 'ვაუჩერი', tagOk: 'დადასტურდა', voucherNo: 'ვაუჩერი #2481',
    kDriver: 'მძღოლი', vDriver: 'გიორგი მ.',
    kStatus: 'სტატუსი', vStatus: 'გადამოწმებული', pdfMade: 'PDF გენერირებულია',
    startBtn: 'ტურის დაწყება',
    splashT: 'ენდე მძღოლს,<br>რომელსაც ჩვენ ვენდობით',
    splashS: 'ტური #2481 · გადამოწმებული მძღოლი',
    gpsT: 'GPS ირთვება', gpsS: 'ადგილმდებარეობა გაზიარდება კომპანიასთან',
    mapT: 'ტური მიმდინარეობს', mapS: 'ვაუჩერი #2481 · Escapers Travel',
    cityA: 'თბილისი', cityB: 'ყაზბეგი',
    lKm: 'კმ გავლილი', lSpd: 'კმ/სთ', lEta: 'დარჩა',
    caps: [
      ['მოლოდინი', 'მძღოლი ხაზზეა, ჯავშანს ელოდება'],
      ['შეტყობინება', 'ახალი ჯავშანი მოდის რეალურ დროში'],
      ['ჯავშანი', 'მარშრუტი, ფასი და პირობები ერთ ეკრანზე'],
      ['ვაუჩერი', 'PDF ავტომატურად გენერირდება დადასტურებისას'],
      ['ტური იწყება', 'ნდობა — ყველაფრის საფუძველი'],
      ['GPS ჩართვა', 'ადგილმდებარეობა უკავშირდება კომპანიას'],
      ['ტური მიმდინარეობს', 'კომპანია ხედავს ტრანსპორტს რუკაზე'],
    ],
  },
  en: {
    driverLine: 'Giorgi M. · Driver',
    empty: 'No bookings yet.<br>You will get a notification as soon as one arrives.',
    now: 'now',
    notif: 'New booking: Tbilisi → Kazbegi, {d}, 08:00 · 280 ₾',
    bookingTitle: 'Booking request', tagNew: 'New',
    kRoute: 'Route', vRoute: 'Tbilisi → Kazbegi',
    kDate: 'Date', kDepart: 'Departure',
    kVehicle: 'Vehicle', vVehicle: 'Minivan',
    kPax: 'Passengers', vPax: '6 people',
    kCompany: 'Company', kPrice: 'Price', kFuel: 'Fuel', vFuel: 'Included',
    decline: 'Decline', accept: 'Accept',
    voucherTitle: 'Voucher', tagOk: 'Confirmed', voucherNo: 'Voucher #2481',
    kDriver: 'Driver', vDriver: 'Giorgi M.',
    kStatus: 'Status', vStatus: 'Verified', pdfMade: 'PDF generated',
    startBtn: 'Start the tour',
    splashT: 'Trust the driver<br>we trust',
    splashS: 'Tour #2481 · Verified driver',
    gpsT: 'Turning on GPS', gpsS: 'Your location will be shared with the company',
    mapT: 'Tour in progress', mapS: 'Voucher #2481 · Escapers Travel',
    cityA: 'Tbilisi', cityB: 'Kazbegi',
    lKm: 'km covered', lSpd: 'km/h', lEta: 'remaining',
    caps: [
      ['Standing by', 'The driver is online, waiting for a booking'],
      ['Notification', 'New bookings arrive in real time'],
      ['Booking', 'Route, price and terms on one screen'],
      ['Voucher', 'The PDF is generated automatically on confirmation'],
      ['Tour begins', 'Trust is what everything rests on'],
      ['GPS on', 'Location connects to the company'],
      ['Tour in progress', 'The company sees the vehicle on the map'],
    ],
  },
  ru: {
    driverLine: 'Гиорги М. · Водитель',
    empty: 'Новых заказов нет.<br>Вы получите уведомление, как только он появится.',
    now: 'сейчас',
    notif: 'Новый заказ: Тбилиси → Казбеги, {d}, 08:00 · 280 ₾',
    bookingTitle: 'Запрос на заказ', tagNew: 'Новый',
    kRoute: 'Маршрут', vRoute: 'Тбилиси → Казбеги',
    kDate: 'Дата', kDepart: 'Выезд',
    kVehicle: 'Транспорт', vVehicle: 'Минивэн',
    kPax: 'Пассажиры', vPax: '6 человек',
    kCompany: 'Компания', kPrice: 'Цена', kFuel: 'Топливо', vFuel: 'Включено в цену',
    decline: 'Отклонить', accept: 'Принять',
    voucherTitle: 'Ваучер', tagOk: 'Подтверждён', voucherNo: 'Ваучер №2481',
    kDriver: 'Водитель', vDriver: 'Гиорги М.',
    kStatus: 'Статус', vStatus: 'Проверен', pdfMade: 'PDF сформирован',
    startBtn: 'Начать тур',
    splashT: 'Доверьтесь водителю,<br>которому доверяем мы',
    splashS: 'Тур №2481 · Проверенный водитель',
    gpsT: 'Включается GPS', gpsS: 'Местоположение будет передано компании',
    mapT: 'Тур выполняется', mapS: 'Ваучер №2481 · Escapers Travel',
    cityA: 'Тбилиси', cityB: 'Казбеги',
    lKm: 'км пройдено', lSpd: 'км/ч', lEta: 'осталось',
    caps: [
      ['Ожидание', 'Водитель на связи и ждёт заказ'],
      ['Уведомление', 'Новые заказы приходят в реальном времени'],
      ['Заказ', 'Маршрут, цена и условия на одном экране'],
      ['Ваучер', 'PDF формируется автоматически при подтверждении'],
      ['Тур начинается', 'Доверие — основа всего'],
      ['Включение GPS', 'Местоположение связывается с компанией'],
      ['Тур выполняется', 'Компания видит транспорт на карте'],
    ],
  },
};

export function pickLang(code: string): Lang {
  return code === 'ka' ? 'ka' : code === 'ru' ? 'ru' : 'en';
}

const DOT = [0, 0, 1, 2, 3, 3, 4];

function mount(host: HTMLElement, startLang: Lang) {
  host.innerHTML = HTML;
  const q = (n: string) => host.querySelector<HTMLElement>(`[data-el="${n}"]`);
  const status = q('status'), clock = q('clock'), notif = q('notif'), notifBody = q('notifBody'),
    gps = q('gps'), splash = q('splash'), tap = q('tap'), cap = q('cap'),
    dateEl = q('date'), vdate = q('vdate'), cityA = q('cityA'), cityB = q('cityB'),
    kmEl = q('km'), spdEl = q('spd'), etaEl = q('eta');
  const route = host.querySelector('[data-el="route"]') as SVGPathElement | null;
  const car = host.querySelector('[data-el="car"]') as SVGGElement | null;
  const steps = Array.from(host.querySelectorAll('[data-el="steps"] i'));
  const scenes: Record<string, HTMLElement> = {};
  host.querySelectorAll<HTMLElement>('[data-scene]').forEach((s) => {
    scenes[s.getAttribute('data-scene') as string] = s;
  });

  let lang: Lang = startLang;
  let capIndex = 0;
  let timers: number[] = [];
  let raf = 0;

  const tbilisi = () => {
    const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tbilisi' }));
    return isNaN(d.getTime()) ? new Date() : d;
  };
  const pad = (n: number) => `0${n}`.slice(-2);
  const tourDay = () => { const d = tbilisi(); d.setDate(d.getDate() + 1); return d; };
  const fmtDate = (d: Date, l: Lang) =>
    l === 'en' ? `${MONTHS.en[d.getMonth()]} ${d.getDate()}` : `${d.getDate()} ${MONTHS[l][d.getMonth()]}`;
  const fmtShort = (d: Date) => `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;

  const tick = () => { if (clock) clock.textContent = `${pad(tbilisi().getHours())}:${pad(tbilisi().getMinutes())}`; };
  tick();
  const clockTimer = window.setInterval(tick, 10000);

  function setCaption(i: number) {
    capIndex = i;
    const c = T[lang].caps[i];
    if (cap) cap.innerHTML = `<b>${c[0]}</b><span>${c[1]}</span>`;
    steps.forEach((el, n) => el.classList.toggle('kkm-on', n === DOT[i]));
  }

  function setLang(l: Lang) {
    lang = l;
    const t = T[l], d = tourDay();
    host.querySelectorAll<HTMLElement>('[data-t]').forEach((el) => {
      const v = t[el.getAttribute('data-t') as string];
      if (typeof v === 'string') el.innerHTML = v;
    });
    if (notifBody) notifBody.textContent = (t.notif as string).replace('{d}', fmtDate(d, l));
    if (dateEl) dateEl.textContent = fmtDate(d, l);
    if (vdate) vdate.textContent = fmtShort(d);
    if (cityA) cityA.textContent = t.cityA as string;
    if (cityB) cityB.textContent = t.cityB as string;
    setCaption(capIndex);
  }

  const at = (ms: number, fn: () => void) => { timers.push(window.setTimeout(fn, ms)); };
  const clearAll = () => { timers.forEach(clearTimeout); timers = []; if (raf) cancelAnimationFrame(raf); raf = 0; };
  const show = (n: string) => Object.keys(scenes).forEach((k) => scenes[k].classList.toggle('kkm-live', k === n));
  const doTap = (x: number, y: number) => {
    if (!tap) return;
    tap.style.left = `${x}%`; tap.style.top = `${y}%`;
    tap.classList.remove('kkm-go'); void tap.offsetWidth; tap.classList.add('kkm-go');
  };
  const press = (n: string) => {
    const el = q(n); if (!el) return;
    el.classList.add('kkm-press');
    window.setTimeout(() => el.classList.remove('kkm-press'), 220);
  };

  const L = route ? route.getTotalLength() : 0;
  if (route) { route.style.strokeDasharray = String(L); route.style.strokeDashoffset = String(L); }

  function drive(dur: number) {
    if (!route || !car) return;
    let t0 = 0;
    const f = (ts: number) => {
      if (!t0) t0 = ts;
      const p = Math.min(1, (ts - t0) / dur), len = L * p;
      route.style.strokeDashoffset = String(L - len);
      const a = route.getPointAtLength(Math.max(0, len - 1.2));
      const b = route.getPointAtLength(Math.min(L, len + 1.2));
      const ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI + 90;
      const pt = route.getPointAtLength(len);
      car.setAttribute('transform', `translate(${pt.x.toFixed(2)},${pt.y.toFixed(2)}) rotate(${ang.toFixed(2)})`);
      if (kmEl) kmEl.textContent = String(Math.round(p * 157));
      if (spdEl) spdEl.textContent = String(54 + Math.round(Math.sin(ts / 700) * 9));
      if (etaEl) { const m = Math.round((1 - p) * 160); etaEl.textContent = `${Math.floor(m / 60)}:${pad(m % 60)}`; }
      if (p < 1) raf = requestAnimationFrame(f);
    };
    raf = requestAnimationFrame(f);
  }

  function run() {
    clearAll();
    show('home');
    notif?.classList.remove('kkm-show', 'kkm-tapped');
    splash?.classList.remove('kkm-live');
    gps?.classList.remove('kkm-live');
    status?.classList.remove('kkm-on-dark');
    if (route) route.style.strokeDashoffset = String(L);
    car?.setAttribute('transform', 'translate(58,508) rotate(0)');
    setCaption(0);

    at(1400, () => { notif?.classList.add('kkm-show'); setCaption(1); });
    at(4200, () => doTap(50, 13));
    at(4550, () => { notif?.classList.add('kkm-tapped'); show('booking'); setCaption(2); });
    at(7600, () => { doTap(74, 79); press('accept'); });
    at(8150, () => { show('voucher'); setCaption(3); });
    at(11600, () => { doTap(50, 78); press('start'); });
    at(12150, () => { splash?.classList.add('kkm-live'); status?.classList.add('kkm-on-dark'); setCaption(4); });
    at(15400, () => { splash?.classList.remove('kkm-live'); gps?.classList.add('kkm-live'); setCaption(5); });
    at(17600, () => {
      show('map'); gps?.classList.remove('kkm-live'); status?.classList.remove('kkm-on-dark');
      setCaption(6); drive(7000);
    });
    at(25800, run);
  }

  setLang(startLang);

  let io: IntersectionObserver | null = null;
  if (typeof IntersectionObserver !== 'undefined') {
    io = new IntersectionObserver((es) => { if (es[0].isIntersecting) run(); else clearAll(); }, { threshold: 0.2 });
    io.observe(host);
  } else {
    run();
  }

  return {
    setLang,
    destroy() {
      clearAll();
      window.clearInterval(clockTimer);
      io?.disconnect();
      host.innerHTML = '';
    },
  };
}

export function PromoPhone({ lang }: { lang: string }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const ctlRef = useRef<{ setLang: (l: Lang) => void; destroy: () => void } | null>(null);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const id = 'kkm-promo-css';
    if (!document.getElementById(id)) {
      const style = document.createElement('style');
      style.id = id;
      style.textContent = CSS;
      document.head.appendChild(style);
    }
    const host = hostRef.current;
    if (!host) return;
    ctlRef.current = mount(host, pickLang(lang));
    return () => { ctlRef.current?.destroy(); ctlRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { ctlRef.current?.setLang(pickLang(lang)); }, [lang]);

  return createElement('div', { ref: hostRef, className: 'kkm-demo' });
}

export default PromoPhone;
