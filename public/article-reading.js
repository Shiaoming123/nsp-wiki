// Adapted from the supplied reading-navigation-kit snapshot 14c2e3f.
(() => {
 'use strict';
 window.WikiArticleReading={mount(host){
  const routeHash=location.hash;
  let seekFrame=0,seekTarget=0,seekTime=0,seekRatio=null,anchor=null,seekPosition=0,seekWritten=0;
  function seekTo(top){
    window.WikiScrollMotion?.cancel();seekTarget=Math.max(0,Math.min(document.documentElement.scrollHeight-innerHeight,top));
    if(matchMedia('(prefers-reduced-motion: reduce)').matches){window.scrollTo({top:seekTarget,behavior:'instant'});return;}
    if(!seekFrame){seekTime=0;seekPosition=seekWritten=scrollY;seekFrame=requestAnimationFrame(step);}
  }
  function step(time){
    seekFrame=0;if(!host.isConnected||document.hidden||Math.abs(scrollY-seekWritten)>2)return;
    const dt=Math.min(48,seekTime?time-seekTime:16.67);seekTime=time;
    // Accumulate fractional travel even when the browser rounds scrollTop to device pixels.
    seekPosition+=(seekTarget-seekPosition)*(1-Math.exp(-dt/90));
    const done=Math.abs(seekTarget-seekPosition)<.5;
    window.scrollTo({top:done?seekTarget:seekPosition,behavior:'instant'});seekWritten=scrollY;
    if(!done)seekFrame=requestAnimationFrame(step);
  }
  const cleanups = [];
  const on = (target, type, fn, options) => {
    target.addEventListener(type, fn, options);
    cleanups.push(() => target.removeEventListener(type, fn, options));
  };
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  // Ordinary wheel input must not cancel the document's existing smooth-scroll handler.
  const stop = () => { cancelAnimationFrame(seekFrame); seekFrame=0;seekRatio=null;anchor=null; };
  const article = host.querySelector(".article-body");
  const headings = [...(article?.querySelectorAll("h1[id],h2[id],h3[id],h4[id],h5[id],h6[id]") ?? [])];
  if(!headings.length){host.classList.add('reading-no-headings');cleanups.push(()=>host.classList.remove('reading-no-headings'));}
  if (article && headings.length) {
    const text = h => h.textContent.replace(/#\s*$/, "").trim();
    const level = Math.min(...headings.map(h => Number(h.tagName.slice(1))));
    const primary = headings.filter(h => Number(h.tagName.slice(1)) === level);
    const sections = primary.length ? primary : headings;
    const nav = document.createElement("nav");
    nav.className = "reading-rail";
    nav.setAttribute("aria-label", "本文动态目录");
    nav.innerHTML =
      '<div class="reading-map"><ol class="reading-labels"></ol><div class="reading-ruler" role="slider" tabindex="0" aria-label="拖动刻度定位阅读位置" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-orientation="vertical"><div class="reading-window" aria-hidden="true"></div></div><div class="reading-progress" aria-hidden="true"><output>000%</output></div></div><footer>悬停总览 · 拖动刻度定位</footer>';
    const mobile = document.createElement("details");
    mobile.className = "reading-mobile";
    mobile.id = "reading-inline-directory";
    const summary = document.createElement("summary");
    summary.textContent = `本文目录 · ${headings.length} 个小节`;
    const mobileList = document.createElement("ol");
    mobile.append(summary, mobileList);
    const introduction = article.firstElementChild;
    if (introduction?.tagName === "P") introduction.after(mobile);
    else article.prepend(mobile);
    const list = nav.querySelector("ol");
    const makeLink = h => {
      const a = document.createElement("a");
      const url=new URL(location.href);url.searchParams.set('reading-section',routeHash+'|'+h.id);a.href=url.href;
      a.dataset.heading = h.id;
      a.textContent = text(h);
      return a;
    };
    const items = sections.map((h, i) => {
      const li = document.createElement("li");
      const a = makeLink(h);
      a.title = text(h);
      const span = document.createElement("span");
      span.textContent = a.textContent;
      a.replaceChildren();
      const small = document.createElement("small");
      small.setAttribute("aria-hidden", "true");
      small.textContent = String(i + 1).padStart(2, "0");
      a.append(small, span);
      li.append(a);
      list.append(li);
      return { h, li, a, top: 0 };
    });
    for (const h of headings) {
      const li = document.createElement("li");
      if (Number(h.tagName.slice(1)) > level) li.className = "sub";
      li.append(makeLink(h));
      mobileList.append(li);
    }
    const fullList = mobileList.cloneNode(true);
    fullList.className = "reading-full";
    fullList.hidden = true;
    nav.querySelector(".reading-map").append(fullList);
    const pocket = document.createElement("div");
    pocket.className = "reading-pocket";
    pocket.innerHTML =
      '<div class="reading-pocket-scale" aria-hidden="true"><i class="reading-pocket-fill"></i><i class="reading-pocket-needle"></i></div><button type="button" class="reading-pocket-open" aria-haspopup="dialog" aria-controls="reading-mobile-sheet"><span class="reading-pocket-title"></span><span class="reading-pocket-percent"></span></button>';
    const pocketButton = pocket.querySelector("button");
    const pocketTitle = pocket.querySelector(".reading-pocket-title");
    const pocketPercent = pocket.querySelector(".reading-pocket-percent");
    const sheet = document.createElement("dialog");
    sheet.id = "reading-mobile-sheet";
    sheet.className = "reading-sheet";
    sheet.setAttribute("aria-label", "本文目录");
    sheet.innerHTML =
      '<div class="reading-sheet-header"><span>本文目录</span><button type="button" aria-label="关闭目录">关闭</button></div>';
    const sheetList = mobileList.cloneNode(true);
    sheetList.className = "reading-sheet-list";
    sheet.append(sheetList);
    if (typeof sheet.showModal !== "function") {
      pocketButton.removeAttribute("aria-haspopup");
      pocketButton.setAttribute("aria-controls", mobile.id);
    }
    let restorePocketFocus = true;
    function closeSheet(restore = true) {
      restorePocketFocus = restore;
      document.documentElement.classList.remove("wiki-reading-sheet-open");
      sheet.close();
    }
    on(pocketButton, "click", () => {
      stop();
      if (typeof sheet.showModal !== "function") {
        mobile.open = true;
        summary.focus();
        mobile.scrollIntoView({
          block: "center",
          behavior: reduced.matches ? "instant" : "smooth",
        });
        return;
      }
      restorePocketFocus = true;
      sheet.showModal();
      document.documentElement.classList.add("wiki-reading-sheet-open");
      const active = sheetList.querySelector('a[aria-current="location"]');
      if (active) {
        sheetList.scrollTop =
          active.offsetTop - sheetList.offsetTop - sheetList.clientHeight / 2;
        active.focus({ preventScroll: true });
      }
    });
    on(sheet.querySelector("button"), "click", () => closeSheet());
    on(sheet, "cancel", () =>
      document.documentElement.classList.remove("wiki-reading-sheet-open")
    );
    on(sheet, "close", () => {
      document.documentElement.classList.remove("wiki-reading-sheet-open");
      if (restorePocketFocus && pocketButton.isConnected)
        pocketButton.focus({ preventScroll: true });
    });
    on(window, "popstate", () => {
      if (sheet.open) closeSheet(false);
      if(location.hash!==routeHash)return;
      stop();
      const target=selectedHeading();
      if(target)jump(target,false);
      else if(Number.isFinite(history.state?.wikiReadingY))window.scrollTo({top:history.state.wikiReadingY,behavior:'instant'});
    });
    on(sheet, "click", event => {
      if (event.target !== sheet) return;
      const rect = sheet.getBoundingClientRect();
      if (
        event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom
      )
        closeSheet();
    });
    host.append(pocket, sheet);
    const ruler = nav.querySelector(".reading-ruler");
    const ghost = document.createElement("div");
    ghost.className = "reading-ghost";
    ghost.setAttribute("aria-hidden", "true");
    ghost.hidden = true;
    const ghostValue = document.createElement("span");
    ghost.append(ghostValue);
    nav.querySelector(".reading-map").append(ghost);
    const ticks = Array.from({ length: 101 }, (_, i) => {
      const tick = document.createElement("i");
      tick.setAttribute("aria-hidden", "true");
      tick.className = "reading-tick" + (i % 10 === 0 ? " major" : "");
      if (i % 10 === 0) {
        const em = document.createElement("em");
        em.textContent = i;
        tick.append(em);
      }
      ruler.append(tick);
      return tick;
    });
    host.append(nav);
    const map = nav.querySelector(".reading-map"),
      windowBox = nav.querySelector(".reading-window"),
      progress = nav.querySelector(".reading-progress"),
      output = nav.querySelector("output");
    let frame = 0,
      articleTop = 0,
      articleHeight = 1,
      allTops = [],
      hover = false,
      focused = false,
      active = 0,
      dirty = true,
      alive = true;
    const desktop = matchMedia(
      "(min-width:1021px) and (any-hover:hover) and (any-pointer:fine)"
    );
    function metrics(){
      const offset=Math.max(16,(document.querySelector('header')?.getBoundingClientRect().bottom||0)+16);
      const range=Math.max(0,articleHeight-Math.max(1,innerHeight-offset));
      const progress=range?clamp((scrollY+offset-articleTop)/range,0,1):(scrollY+innerHeight>=articleTop+articleHeight?1:0);
      return {offset,range,progress};
    }
    function update() {
      frame = 0;
      if (dirty) {
        const articleRect = article.getBoundingClientRect();
        articleTop = articleRect.top + scrollY;
        const gutter = articleRect.left - 32;
        host.classList.toggle(
          "reading-compact",
          !desktop.matches || gutter < 176 || innerHeight < 340
        );
        nav.style.width = `${Math.max(0, Math.min(260, gutter))}px`;
        articleHeight = article.offsetHeight;
        allTops = headings.map(h => h.getBoundingClientRect().top + scrollY);
        for (const item of items)
          item.top = item.h.getBoundingClientRect().top + scrollY;
        const {offset,range}=metrics();
        if(seekRatio!==null)seekTo(articleTop-offset+seekRatio*range);
        else if(anchor?.isConnected){const top=anchor.getBoundingClientRect().top+scrollY-offset;if(Math.abs(top-scrollY)>1)window.scrollTo({top:Math.max(0,top),behavior:'instant'});}
        dirty = false;
      }
      const {offset:headerOffset,range,progress:p}=metrics();
      nav.style.top=Math.max(24,headerOffset)+'px';
      const marker = scrollY + Math.max(headerOffset,Math.min(240, innerHeight * 0.25));
      const end = articleTop + articleHeight;
      const usableHeight=Math.max(1,innerHeight-headerOffset);
      let current = 0;
      for (let i = 0; i < allTops.length; i++)
        if (allTops[i] <= marker) current = i;
      active = 0;
      for (let i = 0; i < items.length; i++)
        if (items[i].top <= marker) active = i;
      for (const a of mobileList.querySelectorAll("a"))
        a.dataset.heading === headings[current].id
          ? a.setAttribute("aria-current", "location")
          : a.removeAttribute("aria-current");
      for (const a of sheetList.querySelectorAll("a"))
        a.dataset.heading === headings[current].id
          ? a.setAttribute("aria-current", "location")
          : a.removeAttribute("aria-current");
      const percent = Math.round(p * 100);
      pocketTitle.textContent = `目录 · ${text(headings[current])}`;
      pocketPercent.textContent = `${percent}%`;
      pocketButton.setAttribute(
        "aria-label",
        `打开本文目录，当前${text(headings[current])}，阅读进度${percent}%`
      );
      pocket.style.setProperty("--pocket-position", `${percent}%`);
      pocket.hidden = scrollY + innerHeight <= articleTop || scrollY >= end;
      if (
        !desktop.matches ||
        host.classList.contains("reading-compact")
      )
        return;
      const height = Math.max(50,map.clientHeight - 18);
      const readableHeight = Math.max(1, range);
      const mapTop = map.getBoundingClientRect().top;
      const capacity = Math.max(1, Math.floor(height / 50));
      const overview = hover || focused || reduced.matches;
      const full = (overview && items.length > capacity) || reduced.matches;
      nav.dataset.list = String(full);
      const complete =
        (reduced.matches ||
          (overview &&
            (headings.length > sections.length || items.length > capacity))) &&
        !list.contains(document.activeElement);
      fullList.hidden = !complete;
      list.hidden = complete;
      for (const a of fullList.querySelectorAll("a"))
        a.dataset.heading === headings[current].id
          ? a.setAttribute("aria-current", "location")
          : a.removeAttribute("aria-current");
      const count = Math.min(items.length, capacity, 7);
      const start = clamp(
        active - Math.floor(count / 2),
        0,
        Math.max(0, items.length - count)
      );
      const shown = items.filter((item, i) => {
        const visible = full || overview || item.a===document.activeElement || (i >= start && i < start + count);
        item.li.hidden = !visible;
        i === active
          ? item.a.setAttribute("aria-current", "location")
          : item.a.removeAttribute("aria-current");
        return visible;
      });
      if (!full) {
        const positions = shown.map(item =>
          overview
            ? clamp((item.top - articleTop) / readableHeight, 0, 1) *
              (height - 48)
            : clamp(item.top - scrollY - mapTop, 0, height - 48)
        );
        for (let i = 1; i < positions.length; i++)
          positions[i] = Math.max(positions[i], positions[i - 1] + 50);
        if (positions.at(-1) > height - 48) {
          positions[positions.length - 1] = height - 48;
          for (let i = positions.length - 2; i >= 0; i--)
            positions[i] = Math.min(positions[i], positions[i + 1] - 50);
        }
        const focusedIndex = shown.findIndex(item => item === items[active]);
        map.style.setProperty(
          "--reading-focus",
          `${Math.max(0, positions[focusedIndex] ?? 0) + 24}px`
        );
        for (let i = 0; i < shown.length; i++)
          shown[i].li.style.transform =
            `translateY(${Math.max(0, positions[i])}px)`;
      }
      for (let i = 0; i < ticks.length; i++) {
        const y = overview
          ? (i / 100) * height
          : height * 0.42 + (i / 100 - p) * readableHeight;
        ticks[i].style.transform = `translateY(${y}px)`;
        ticks[i].hidden = y < 0 || y > height;
      }
      const windowHeight = Math.min(1, usableHeight / articleHeight) * height;
      const windowTop = p * (height - windowHeight);
      windowBox.style.transform = `translateY(${windowTop}px)`;
      windowBox.style.height = `${windowHeight}px`;
      windowBox.hidden = !overview;
      progress.style.transform = `translateY(${overview ? p * height : height * 0.42}px)`;
      output.textContent = String(Math.round(p * 100)).padStart(3, "0") + "%";
      ruler.setAttribute("aria-valuenow", String(Math.round(p * 100)));
      ruler.setAttribute("aria-valuetext", `阅读进度 ${Math.round(p * 100)}%`);
      nav.style.opacity = scrollY > end ? ".5" : "1";
    }
    function schedule() {
      if (!alive) return;
      if (!frame) frame = requestAnimationFrame(update);
    }
    function measure() {
      if (alive) {
        dirty = true;
        schedule();
      }
    }
    on(window, "scroll", schedule, { passive: true });
    on(window, "resize", measure);
    on(desktop, "change", measure);
    on(reduced, "change", () => {stop();schedule();});
    let hoverTimer = 0;
    on(nav, "pointerenter", () => {
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(() => {
        hover = true;
        schedule();
      }, 150);
    });
    on(nav, "pointerleave", () => {
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(() => {
        hover = false;
        schedule();
      }, 150);
    });
    cleanups.push(() => clearTimeout(hoverTimer));
    on(nav, "focusin", () => {
      focused = true;
      schedule();
    });
    on(nav, "focusout", () => {
      queueMicrotask(() => {
        focused = nav.contains(document.activeElement);
        schedule();
      });
    });
    let dragPointer = null;
    function seek(ratio) {
      anchor=null;seekRatio=clamp(ratio,0,1);
      const {offset,range}=metrics();
      seekTo(articleTop-offset+seekRatio*range);
    }
    function seekPointer(event) {
      const rect = ruler.getBoundingClientRect();
      seek((event.clientY - rect.top) / Math.max(1, rect.height - 18));
    }
    on(ruler, "pointerdown", event => {
      if (event.button !== 0 || !event.isPrimary || dragPointer !== null)
        return;
      event.preventDefault();
      event.stopPropagation();
      stop();
      dragPointer = event.pointerId;
      nav.dataset.dragging = "true";
      ruler.setPointerCapture(dragPointer);
      ruler.focus({ preventScroll: true });
      seekPointer(event);
    });
    on(ruler, "pointermove", event => {
      const rect = ruler.getBoundingClientRect();
      const y = clamp(
        event.clientY - rect.top,
        0,
        Math.max(1, rect.height - 18)
      );
      ghost.hidden = false;
      ghost.style.transform = `translateY(${y}px)`;
      ghostValue.textContent = `${Math.round((y / Math.max(1, rect.height - 18)) * 100)}%`;
      if (event.pointerId === dragPointer) seekPointer(event);
    });
    on(ruler, "pointerleave", () => {
      ghost.hidden = true;
    });
    function finishDrag(event) {
      if (event.pointerId !== dragPointer) return;
      const pointer = dragPointer;
      dragPointer = null;
      delete nav.dataset.dragging;
      if (ruler.hasPointerCapture(pointer))
        ruler.releasePointerCapture(pointer);
      if (event.type !== "pointerup") stop();
      schedule();
    }
    on(ruler, "pointerup", finishDrag);
    on(ruler, "pointercancel", finishDrag);
    on(ruler, "lostpointercapture", finishDrag);
    on(ruler, "keydown", event => {
      const {progress:current,range}=metrics();
      const ratios = {
        Home: 0,
        End: 1,
        ArrowUp: current - 0.01,
        ArrowDown: current + 0.01,
        ArrowLeft: current - 0.01,
        ArrowRight: current + 0.01,
        PageUp: current - 0.1,
        PageDown: current + 0.1,
      };
      if (!(event.key in ratios)) return;
      event.preventDefault();
      event.stopPropagation();
      if(!range&&!['Home','End'].includes(event.key))return;
      stop();
      seek(ratios[event.key]);
    });
    for (const root of [nav, mobile, sheet])
      on(root, "click", async event => {
        if (
          event.ctrlKey ||
          event.metaKey ||
          event.shiftKey ||
          event.altKey ||
          event.button !== 0
        )
          return;
        const a = event.target.closest("a[data-heading]");
        if (!a) return;
        const target = headings.find(h=>h.id===a.dataset.heading);
        if (!target) return;
        event.preventDefault();
        stop();
        if (root === mobile) {
          mobile.open = false;
          dirty = true;
        }
        if (root === sheet) closeSheet(false);
        if(!alive||!target.isConnected)return;
        const prior=history.state&&typeof history.state==='object'?history.state:{};
        history.replaceState({...prior,wikiReadingY:scrollY},'',location.href);
        history.pushState({...prior,wikiReadingY:null},'',a.href);
        jump(target,true);
      });
    const observer = new ResizeObserver(measure);
    observer.observe(article);
    document.fonts.ready.then(measure);
    window.__articleTocDrawerCleanup?.();
    window.__articleTocDrawerCleanup = null;
    host.classList.add("reading-enhanced");
    function selectedHeading(){const value=new URL(location.href).searchParams.get('reading-section');return headings.find(h=>value===routeHash+'|'+h.id);}
    function jump(target,smooth){
      anchor=target;seekRatio=null;
      const offset=Math.max(16,(document.querySelector('header')?.getBoundingClientRect().bottom||0)+16);
      target.setAttribute('tabindex','-1');target.focus({preventScroll:true});
      window.scrollTo({top:Math.max(0,target.getBoundingClientRect().top+scrollY-offset),behavior:smooth&&!reduced.matches?'smooth':'instant'});
    }
    update();
    const selected=selectedHeading();if(selected)jump(selected,false);
    cleanups.push(() => {
      alive = false;stop();
      observer.disconnect();
      cancelAnimationFrame(frame);
      nav.remove();
      mobile.remove();
      sheet.remove();
      pocket.remove();
      document.documentElement.classList.remove("wiki-reading-sheet-open");
      host.classList.remove("reading-enhanced", "reading-compact");
    });
  }

  for(const name of ['wheel','touchstart'])on(window,name,stop,{passive:true});
  on(document,'pointerdown',event=>{if(!event.target.closest('.reading-ruler'))stop();},{capture:true,passive:true});
  on(document,'keydown',event=>{if(!event.target.closest('.reading-ruler'))stop();},{capture:true});
  on(document,'visibilitychange',()=>{if(document.hidden)stop();});
  return {dispose(){stop();for(const fn of cleanups)fn();}};
 }};
})();
