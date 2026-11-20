/* Story Kit viewer — plain JS, no build step, works from file:// */
(function () {
  "use strict";

  var DATA = window.WORK_DATA || { work: {}, story: [], characters: [], timeline: [], worldview: [] };
  var WORK = DATA.work || {};
  var app = document.getElementById("app");
  var sidebar = document.getElementById("sidebar");
  var shell = document.getElementById("shell");
  var crumbEl = document.getElementById("crumb");

  var state = { route: "home", season: "全部", faction: "全部", query: "" };

  /* ---------------- utils ---------------- */

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function norm(s) { return String(s || "").toLowerCase(); }

  function seasonClass(season) {
    if (/三/.test(season)) return "s3";
    if (/二/.test(season)) return "s2";
    return "s1";
  }

  function seasonTag(season) {
    var cls = seasonClass(season);
    return '<span class="tag ' + cls + '">' + esc(season) + "</span>";
  }

  function chapterById(id) {
    return DATA.story.find(function (c) { return c.id === id; });
  }
  function charById(id) {
    return DATA.characters.find(function (c) { return c.id === id; });
  }

  function fmtDate(d) {
    try {
      return new Date(d).toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" });
    } catch (e) { return d || ""; }
  }

  function highlight(text, q) {
    var safe = esc(text);
    if (!q) return safe;
    var re = new RegExp("(" + q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "gi");
    return safe.replace(re, "<mark>$1</mark>");
  }

  function go(hash) {
    if (location.hash === hash) render();
    else location.hash = hash;
  }

  /* ---------------- search index ---------------- */

  var INDEX = [];

  function buildIndex() {
    INDEX = [];
    DATA.story.forEach(function (ch) {
      var textParts = [ch.oneLiner || ""].concat(ch.summary || []);
      (ch.scenes || []).forEach(function (sc) {
        (sc.lines || []).forEach(function (ln) {
          if (ln.type === "narration") textParts.push(ln.text || "");
          else textParts.push((ln.speaker || "") + "：" + (ln.text || ""));
        });
      });
      INDEX.push({
        kind: "剧情",
        route: "#/story/" + ch.id,
        title: (ch.season ? ch.season + " · " : "") + ch.title,
        sub: (ch.version ? "v" + ch.version + " · " : "") + ch.oneLiner,
        text: textParts.join("\n")
      });
    });
    DATA.characters.forEach(function (c) {
      var textParts = [c.faction || "", c.role || ""].concat(c.keywords || [], c.background || []);
      (c.relationships || []).forEach(function (r) { textParts.push(r.name + "：" + r.desc); });
      (c.quotes || []).forEach(function (q) { textParts.push((q.speaker || c.name) + "：" + q.text); });
      INDEX.push({
        kind: "角色",
        route: "#/char/" + c.id,
        title: c.name + (c.en ? " / " + c.en : ""),
        sub: (c.faction || "") + (c.role ? " · " + c.role : ""),
        text: textParts.join("\n")
      });
    });
    DATA.timeline.forEach(function (t, i) {
      INDEX.push({
        kind: "时间线",
        route: "#/timeline",
        title: t.title,
        sub: (t.era || "") + (t.date ? " · " + t.date : ""),
        text: (t.body || []).join("\n")
      });
    });
    DATA.worldview.forEach(function (w) {
      INDEX.push({
        kind: "世界观",
        route: "#/world",
        title: w.title,
        sub: w.en || "",
        text: (w.body || []).join("\n")
      });
    });
  }

  function search(q) {
    q = q.trim();
    if (!q) return [];
    var lq = norm(q);
    var out = [];
    INDEX.forEach(function (item) {
      var title = norm(item.title), text = norm(item.text), sub = norm(item.sub);
      var score = 0;
      if (title.indexOf(lq) >= 0) score += 100;
      if (sub.indexOf(lq) >= 0) score += 30;
      var pos = text.indexOf(lq);
      if (pos >= 0) {
        score += 10;
        var occurrences = text.split(lq).length - 1;
        score += Math.min(occurrences, 10);
      }
      if (!score) return;
      var snippet = "";
      if (pos >= 0) {
        var start = Math.max(0, pos - 40);
        snippet = item.text.slice(start, pos + q.length + 70).replace(/\n+/g, " ");
      } else {
        snippet = (item.sub || item.text.slice(0, 100)).replace(/\n+/g, " ");
      }
      out.push({ item: item, score: score, snippet: snippet });
    });
    out.sort(function (a, b) { return b.score - a.score; });
    return out.slice(0, 40);
  }

  /* ---------------- shared render bits ---------------- */

  function navHTML(active) {
    var items = [
      ["home", "◈", "总览"],
      ["timeline", "⌁", "时间线"],
      ["story", "▶", "主线剧情"],
      ["chars", "◉", "角色档案"],
      ["world", "✦", "世界观"],
      ["search", "/", "全局搜索"]
    ];
    return '<nav class="nav">' + items.map(function (it) {
      return '<button class="nav-item ' + (active === it[0] ? "active" : "") + '" data-nav="' + it[0] + '">' +
        '<span class="ico">' + it[1] + "</span>" + it[2] + "</button>";
    }).join("") + "</nav>";
  }

  function crumb(parts) {
    return parts.map(function (p, i) {
      return i === parts.length - 1 ? "<b>" + esc(p) + "</b>" : esc(p) + " / ";
    }).join("");
  }

  function dialogueHTML(sc) {
    var html = "";
    (sc.lines || []).forEach(function (ln) {
      if (ln.type === "narration") {
        html += '<div class="dlg-narr">【旁白】' + esc(ln.text) + "</div>";
      } else {
        html += '<div class="dlg"><div class="dlg-speaker">' + esc(ln.speaker) + '</div><div class="dlg-text">' +
          esc(ln.text) + "</div></div>";
      }
    });
    return html;
  }

  function scenePlainText(sc) {
    return (sc.lines || []).map(function (ln) {
      return ln.type === "narration" ? "【旁白】" + ln.text : ln.speaker + "：" + ln.text;
    }).join("\n");
  }

  /* ---------------- pages ---------------- */

  function pageHome() {
    var chapters = DATA.story.slice();
    var latest = chapters.slice().sort(function (a, b) {
      return (b.version || "").localeCompare(a.version || "", "zh", { numeric: true });
    }).slice(0, 5);
    var featured = DATA.characters.slice(0, 8);
    var terms = DATA.worldview.slice(0, 8);
    var update = WORK.updated || "";

    return '' +
      '<section class="hero">' +
        '<div class="kicker">Fanfic Story Kit / ' + esc(WORK.en || "") + '</div>' +
        '<h1>把剧情记不住的，<em>都放这里</em>。</h1>' +
        '<p class="lead">' + esc(WORK.intro || "主线剧情、角色背景、世界观与时间线参考。对话与设定以官方文本为准，个别场景为剧情概述。") + "</p>" +
        '<div class="hero-actions">' +
          '<button class="btn primary" data-go="#/story">开始翻剧情 →</button>' +
          '<button class="btn" data-go="#/timeline">看完整时间线</button>' +
          '<button class="btn" data-go="#/search">搜索台词 / 角色</button>' +
        "</div>" +
      "</section>" +
      '<div class="stat-row">' +
        '<div class="stat"><b>' + DATA.story.length + "</b><span>章节条目</span></div>" +
        '<div class="stat"><b>' + DATA.characters.length + "</b><span>角色档案</span></div>" +
        '<div class="stat"><b>' + DATA.worldview.length + "</b><span>世界观词条</span></div>" +
        '<div class="stat"><b>' + DATA.timeline.length + "</b><span>时间线事件</span></div>" +
      "</div>" +
      '<div class="home-grid">' +
        '<div class="panel">' +
          '<h3>最近版本剧情 <span>LATEST</span></h3><div class="mini-list">' +
          latest.map(function (ch) {
            return '<div class="mini-item" data-go="#/story/' + esc(ch.id) + '">' +
              '<span class="mini-num">' + esc(ch.version || "") + "</span>" +
              '<span><span class="mini-title">' + esc(ch.title) + "</span>" +
              '<span class="mini-sub">' + esc(ch.oneLiner || "") + "</span></span>" +
              '<span class="mini-ver">' + esc(ch.season || "") + "</span></div>";
          }).join("") + "</div>" +
        "</div>" +
        '<div class="panel">' +
          '<h3>快速入口 <span>SHORTCUT</span></h3>' +
          '<p class="muted" style="font-size:12.5px;margin:0 0 12px">按故事阶段浏览，或直接搜角色名 / 台词关键词。</p>' +
          '<div class="chip-cloud">' +
            DATA.story.filter(function (c) { return c.season; }).slice(0, 12).map(function (c) {
              return '<span class="tag" data-go="#/story/' + esc(c.id) + '" style="cursor:pointer">' + esc(c.title) + "</span>";
            }).join("") +
          "</div>" +
          '<div style="margin-top:18px;font-size:11.5px;color:var(--dim);line-height:1.8">' +
            "更新：" + esc(update || "持续补充") + "<br>" +
            "含剧透。关键对话尽量保留原文，概述部分已标注。" +
          "</div>" +
        "</div>" +
      "</div>" +
      '<div class="section-bar"><h2>主要角色 <span class="count">' + DATA.characters.length + " ENTRIES</span></h2>" +
        '<button class="btn" data-go="#/chars">全部角色 →</button></div>' +
      '<div class="char-grid">' + featured.map(charCardHTML).join("") + "</div>" +
      '<div class="section-bar"><h2>世界观关键词 <span class="count">GLOSSARY</span></h2>' +
        '<button class="btn" data-go="#/world">全部词条 →</button></div>' +
      '<div class="chip-cloud">' + terms.map(function (w) {
        return '<span class="tag" data-go="#/world" style="cursor:pointer;padding:6px 10px;font-size:12px">' + esc(w.title) + "</span>";
      }).join("") + "</div>";
  }

  function pageStoryList() {
    var seasons = [];
    DATA.story.forEach(function (c) {
      if (seasons.indexOf(c.season) < 0) seasons.push(c.season);
    });
    var list = state.season === "全部" ? DATA.story : DATA.story.filter(function (c) { return c.season === state.season; });
    list = list.slice().sort(function (a, b) {
      var sa = seasons.indexOf(a.season), sb = seasons.indexOf(b.season);
      if (sa !== sb) return sa - sb;
      return (a.order || 0) - (b.order || 0);
    });

    return '' +
      '<div class="page-head"><div class="kicker">Main Story</div><h1>主线剧情</h1>' +
      "<p>按版本顺序整理，含剧情脉络、关键场景对话、名台词与伏笔。点开章节阅读；对话可整段复制。</p></div>" +
      '<div class="season-tabs">' +
        ["全部"].concat(seasons).map(function (s) {
          return '<button class="season-tab ' + (state.season === s ? "active" : "") + '" data-season="' + esc(s) + '">' + esc(s) + "</button>";
        }).join("") +
      "</div>" +
      '<div class="chapter-list">' +
        list.map(function (ch, i) {
          var cls = seasonClass(ch.season);
          return '<article class="chapter-card ' + cls + '" data-go="#/story/' + esc(ch.id) + '">' +
            '<div class="chapter-idx"><b>' + String(ch.order || i + 1).padStart(2, "0") + "</b>" + esc(ch.version ? "v" + ch.version : "") + "</div>" +
            "<div><div class=\"chapter-title\">" + esc(ch.title) + "</div>" +
              '<div class="chapter-one">' + esc(ch.oneLiner || "") + "</div></div>" +
            '<div class="chapter-meta"><div class="tags">' + seasonTag(ch.season) +
              (ch.factions || []).slice(0, 2).map(function (f) { return '<span class="tag">' + esc(f) + "</span>"; }).join("") +
            "</div></div></article>";
        }).join("") +
      "</div>";
  }

  function pageStoryDetail(id) {
    var ch = chapterById(id);
    if (!ch) return pageNotFound();
    var idx = DATA.story.indexOf(ch);
    var prev = DATA.story[idx - 1], next = DATA.story[idx + 1];
    var toc = (ch.scenes || []).map(function (s, i) {
      return '<a class="toc-link" data-scroll="scene-' + i + '" style="cursor:pointer">' + esc(s.title || "场景 " + (i + 1)) + "</a>";
    }).join("");

    return '' +
      '<div class="detail-head">' +
        '<div class="kicker">' + esc(ch.season) + (ch.version ? " / Version " + esc(ch.version) : "") + "</div>" +
        "<h1>" + esc(ch.title) + "</h1>" +
        (ch.oneLiner ? '<div class="detail-one">「' + esc(ch.oneLiner) + "」</div>" : "") +
        '<div class="meta-grid">' +
          (ch.version ? "<span><b>版本</b>v" + esc(ch.version) + "</span>" : "") +
          (ch.factions && ch.factions.length ? "<span><b>阵营</b>" + ch.factions.map(esc).join(" / ") + "</span>" : "") +
          "<span><b>场景</b>" + (ch.scenes || []).length + " 段</span>" +
          "<span><b>台词</b>" + countLines(ch) + " 句</span>" +
        "</div>" +
      "</div>" +
      '<div class="story-body"><div class="story-main">' +
        (ch.summary && ch.summary.length ? '<div class="section-bar" id="summary" style="margin-top:0"><h2>剧情脉络</h2></div><div class="prose">' +
          ch.summary.map(function (p) { return "<p>" + esc(p) + "</p>"; }).join("") + "</div>" : "") +
        (ch.scenes && ch.scenes.length ? '<div class="section-bar"><h2>关键场景与对话 <span class="count">' + ch.scenes.length + " SCENES</span></h2></div>" +
          ch.scenes.map(function (sc, i) {
            return '<section class="scene" id="scene-' + i + '"><div class="scene-head">' +
              "<h4>" + esc(sc.title || "场景 " + (i + 1)) + "</h4>" +
              '<button class="scene-copy" data-copy="' + i + '">复制对话</button></div>' +
              '<div class="scene-body">' + dialogueHTML(sc) + "</div></section>";
          }).join("") : "") +
        (ch.quotes && ch.quotes.length ? '<div class="section-bar" id="quotes"><h2>名台词 / 梗</h2></div><div class="quote-list">' +
          ch.quotes.map(function (q) {
            return '<div class="quote"><span class="q-speaker">' + esc(q.speaker) + '</span><q>' + esc(q.text) + "</q></div>";
          }).join("") + "</div>" : "") +
        (ch.notes && ch.notes.length ? '<div class="section-bar"><h2>伏笔与备注</h2></div><ul class="note-list">' +
          ch.notes.map(function (n) { return "<li>" + esc(n) + "</li>"; }).join("") + "</ul>" : "") +
        (ch.sources && ch.sources.length ? '<div class="section-bar"><h2>参考来源</h2></div><div class="source-list">' +
          ch.sources.map(function (s) {
            return '<a href="' + esc(s) + '" target="_blank" rel="noopener">' + esc(s) + "</a>";
          }).join("") + "</div>" : "") +
        '<div class="chapter-nav">' +
          (prev ? '<div class="cn" data-go="#/story/' + esc(prev.id) + '"><span>PREV</span><b>← ' + esc(prev.title) + "</b></div>" : "<div></div>") +
          (next ? '<div class="cn right" data-go="#/story/' + esc(next.id) + '"><span>NEXT</span><b>' + esc(next.title) + " →</b></div>" : "<div></div>") +
        "</div>" +
      "</div><aside class=\"story-aside\">" +
        '<div class="aside-box"><h4>本页目录</h4>' +
          (ch.summary && ch.summary.length ? '<a class="toc-link" data-scroll="summary" style="cursor:pointer">剧情脉络</a>' : "") +
          toc +
          (ch.quotes && ch.quotes.length ? '<a class="toc-link" data-scroll="quotes" style="cursor:pointer">名台词</a>' : "") +
        "</div>" +
        '<div class="aside-box"><h4>快捷操作</h4>' +
          '<button class="btn" style="width:100%;justify-content:center;margin-bottom:8px" data-go="#/story">返回章节列表</button>' +
          '<button class="btn" style="width:100%;justify-content:center" data-print>打印 / 存 PDF</button>' +
        "</div>" +
      "</aside></div>";
  }

  function countLines(ch) {
    return (ch.scenes || []).reduce(function (n, sc) {
      return n + (sc.lines || []).filter(function (l) { return l.type !== "narration"; }).length;
    }, 0);
  }

  function charCardHTML(c) {
    var initial = (c.name || "?").slice(0, 1);
    return '<article class="char-card" data-faction="' + esc(c.faction || "") + '" data-go="#/char/' + esc(c.id) + '">' +
      '<div class="char-avatar">' + esc(initial) + "</div>" +
      '<div class="char-name">' + esc(c.name) + "</div>" +
      (c.en ? '<div class="char-en">' + esc(c.en) + "</div>" : "") +
      '<div class="char-desc">' + esc(c.tagline || (c.keywords || []).join(" · ") || "") + "</div></article>";
  }

  function pageChars() {
    var factions = [];
    DATA.characters.forEach(function (c) {
      if (c.faction && factions.indexOf(c.faction) < 0) factions.push(c.faction);
    });
    var list = state.faction === "全部" ? DATA.characters : DATA.characters.filter(function (c) { return c.faction === state.faction; });
    return '<div class="page-head"><div class="kicker">Agents / Factions</div><h1>角色档案</h1>' +
      "<p>按阵营筛选。档案含背景故事、关键关系与代表台词，可直接用于同人设定核对。</p></div>" +
      '<div class="filter-row">' +
        ["全部"].concat(factions).map(function (f) {
          return '<button class="season-tab ' + (state.faction === f ? "active" : "") + '" data-faction="' + esc(f) + '">' + esc(f) + "</button>";
        }).join("") +
      "</div>" +
      '<div class="char-grid">' + list.map(charCardHTML).join("") + "</div>";
  }

  function pageCharDetail(id) {
    var c = charById(id);
    if (!c) return pageNotFound();
    var related = DATA.story.filter(function (ch) {
      return (ch.factions || []).indexOf(c.faction) >= 0;
    }).slice(0, 8);

    return '<div class="detail-head"><div class="char-detail-head">' +
        '<div class="char-avatar">' + esc((c.name || "?").slice(0, 1)) + "</div>" +
        "<div><div class=\"char-en\">" + esc(c.en || "") + "</div><h1>" + esc(c.name) + "</h1>" +
          '<div class="meta-grid" style="margin-top:8px">' +
            (c.faction ? "<span><b>阵营</b>" + esc(c.faction) + "</span>" : "") +
            (c.role ? "<span><b>定位</b>" + esc(c.role) + "</span>" : "") +
            (c.debut ? "<span><b>初登场</b>" + esc(c.debut) + "</span>" : "") +
          "</div>" +
          ((c.keywords || []).length ? '<div class="chip-cloud" style="margin-top:10px">' +
            c.keywords.map(function (k) { return '<span class="tag">' + esc(k) + "</span>"; }).join("") + "</div>" : "") +
        "</div></div>" +
        (c.tagline ? '<div class="detail-one">「' + esc(c.tagline) + "」</div>" : "") +
      "</div>" +
      '<div class="story-body"><div class="story-main">' +
        '<div class="section-bar" style="margin-top:0"><h2>背景故事</h2></div><div class="prose">' +
          (c.background || []).map(function (p) { return "<p>" + esc(p) + "</p>"; }).join("") + "</div>" +
        ((c.relationships || []).length ? '<div class="section-bar"><h2>关键关系</h2></div><div class="rel-list">' +
          c.relationships.map(function (r) {
            return '<div class="rel-item"><b>' + esc(r.name) + "</b><span>" + esc(r.desc) + "</span></div>";
          }).join("") + "</div>" : "") +
        ((c.quotes || []).length ? '<div class="section-bar"><h2>代表台词</h2></div><div class="quote-list">' +
          c.quotes.map(function (q) {
            return '<div class="quote"><span class="q-speaker">' + esc(q.speaker || c.name) + '</span><q>' + esc(q.text) + "</q></div>";
          }).join("") + "</div>" : "") +
        (related.length ? '<div class="section-bar"><h2>相关章节</h2></div><div class="chapter-list">' +
          related.map(function (ch) {
            return '<article class="chapter-card ' + seasonClass(ch.season) + '" data-go="#/story/' + esc(ch.id) + '">' +
              '<div class="chapter-idx"><b>' + String(ch.order || "").padStart(2, "0") + "</b>" + esc(ch.version || "") + "</div>" +
              '<div><div class="chapter-title">' + esc(ch.title) + '</div><div class="chapter-one">' + esc(ch.oneLiner || "") + "</div></div>" +
              "<div></div></article>";
          }).join("") + "</div>" : "") +
      "</div><aside class=\"story-aside\"><div class=\"aside-box\"><h4>快捷操作</h4>" +
        '<button class="btn" style="width:100%;justify-content:center" data-go="#/chars">返回角色列表</button></div>' +
        '<div class="aside-box"><h4>同阵营</h4>' +
          DATA.characters.filter(function (x) { return x.faction === c.faction && x.id !== c.id; }).slice(0, 8).map(function (x) {
            return '<a class="toc-link" data-go="#/char/' + esc(x.id) + '" style="cursor:pointer">' + esc(x.name) + "</a>";
          }).join("") +
        "</div></aside></div>";
  }

  function pageTimeline() {
    var html = '<div class="page-head"><div class="kicker">Timeline</div><h1>完整时间线</h1>' +
      "<p>从旧都陷落到当前版本。可按阶段快速定位事件；带链接的条目可直接跳到对应章节。</p></div><div class=\"tl\">";
    var lastEra = null;
    DATA.timeline.forEach(function (t) {
      if (t.era && t.era !== lastEra) {
        html += '<div class="tl-era">' + esc(t.era) + "</div>";
        lastEra = t.era;
      }
      html += '<div class="tl-item ' + (t.minor ? "minor" : "") + '">' +
        (t.date ? '<div class="tl-date">' + esc(t.date) + "</div>" : "") +
        '<div class="tl-title">' + esc(t.title) + "</div>" +
        '<p class="tl-desc">' + esc((t.body || []).join(" ")) + "</p>" +
        (t.chapter && chapterById(t.chapter) ? '<a class="tl-link" data-go="#/story/' + esc(t.chapter) + '">查看章节：' + esc(chapterById(t.chapter).title) + " →</a>" : "") +
        "</div>";
    });
    return html + "</div>";
  }

  function pageWorld() {
    return '<div class="page-head"><div class="kicker">World / Glossary</div><h1>世界观与设定</h1>' +
      "<p>写同人前先对齐名词：空洞、以太、绳匠、邦布、新艾利都的势力与规则。</p></div>" +
      '<div class="world-grid">' + DATA.worldview.map(function (w, i) {
        return '<article class="world-card" data-idx="' + String(i + 1).padStart(2, "0") + '">' +
          "<h3>" + esc(w.title) + "</h3>" +
          (w.en ? '<div class="en">' + esc(w.en) + "</div>" : "") +
          (w.body || []).map(function (p) { return "<p>" + esc(p) + "</p>"; }).join("") +
          "</article>";
      }).join("") + "</div>";
  }

  function searchResultsHTML(q) {
    var results = search(q);
    var groups = {};
    results.forEach(function (r) {
      var k = r.item.kind;
      (groups[k] = groups[k] || []).push(r);
    });
    var order = ["剧情", "角色", "世界观", "时间线"];
    if (!q) {
      return '<div class="empty-state"><b>' + INDEX.length + " 条内容已建立索引</b>输入角色名、地名、台词片段即可全库搜索。</div>";
    }
    if (!results.length) {
      return '<div class="empty-state"><b>没有找到「' + esc(q) + "」</b>换个关键词试试，比如角色名、章节名、台词片段。</div>";
    }
    return order.filter(function (k) { return groups[k]; }).map(function (k) {
      return '<div class="result-group"><h3>' + esc(k) + " · " + groups[k].length + "</h3>" +
        groups[k].map(function (r) {
          return '<a class="result" data-go="' + esc(r.item.route) + '">' +
            '<div class="result-title"><span class="result-kind">' + esc(r.item.kind) + "</span>" +
            highlight(r.item.title, q) + "</div>" +
            '<div class="result-snippet">' + highlight(r.snippet, q) + "</div></a>";
        }).join("") + "</div>";
    }).join("");
  }

  function pageSearch() {
    return '<div class="page-head"><div class="kicker">Search</div><h1>全局搜索</h1>' +
      "<p>覆盖剧情概述、逐句对话、角色背景、世界观词条与时间线。</p></div>" +
      '<div class="search-box"><span class="glass">⌕</span><input class="search-input" id="searchInput" placeholder="搜索：妮可 / 空洞 / 雅 / 一句台词……" value="' + esc(state.query) + '" autocomplete="off"></div>' +
      '<div id="searchResults">' + searchResultsHTML(state.query) + "</div>";
  }

  function pageNotFound() {
    return '<div class="empty-state"><b>页面不存在</b><a href="#/home" style="color:var(--yellow)">返回总览 →</a></div>';
  }

  /* ---------------- router ---------------- */

  function parseHash() {
    var h = (location.hash || "#/home").replace(/^#\/?/, "");
    var qIdx = h.indexOf("?");
    var query = "";
    if (qIdx >= 0) {
      var qs = h.slice(qIdx + 1);
      h = h.slice(0, qIdx);
      qs.split("&").forEach(function (kv) {
        var p = kv.split("=");
        if (p[0] === "q") query = decodeURIComponent(p[1] || "");
      });
    }
    var parts = h.split("/").filter(Boolean);
    return { page: parts[0] || "home", id: parts[1] || "", query: query };
  }

  function navKey(page) {
    if (page === "story") return "story";
    if (page === "chars" || page === "char") return "chars";
    return page;
  }

  function render() {
    var r = parseHash();
    var page = r.page;
    var html = "", active = navKey(page), crumbParts = [WORK.name || "Story Kit"];

    if (page === "home" || page === "") {
      html = pageHome(); active = "home"; crumbParts.push("总览");
    } else if (page === "story" && r.id) {
      var ch = chapterById(r.id);
      html = pageStoryDetail(r.id); active = "story";
      crumbParts.push("主线剧情", ch ? ch.title : "未找到");
    } else if (page === "story") {
      html = pageStoryList(); active = "story"; crumbParts.push("主线剧情");
    } else if (page === "chars") {
      html = pageChars(); active = "chars"; crumbParts.push("角色档案");
    } else if (page === "char" && r.id) {
      var c = charById(r.id);
      html = pageCharDetail(r.id); active = "chars";
      crumbParts.push("角色档案", c ? c.name : "未找到");
    } else if (page === "timeline") {
      html = pageTimeline(); active = "timeline"; crumbParts.push("时间线");
    } else if (page === "world") {
      html = pageWorld(); active = "world"; crumbParts.push("世界观");
    } else if (page === "search") {
      state.query = r.query || "";
      html = pageSearch(); active = "search"; crumbParts.push("搜索");
    } else {
      html = pageNotFound();
    }

    app.innerHTML = '<div id="story-top"></div>' + html;
    sidebar.innerHTML = brandHTML() + navHTML(active) + footHTML();
    crumbEl.innerHTML = crumb(crumbParts);

    if (page === "search") {
      var input = document.getElementById("searchInput");
      if (input) {
        input.addEventListener("input", function () {
          state.query = input.value;
          try {
            history.replaceState(null, "", "#/search" + (input.value ? "?q=" + encodeURIComponent(input.value) : ""));
          } catch (err) { /* file:// may reject history updates */ }
          var box = document.getElementById("searchResults");
          if (box) box.innerHTML = searchResultsHTML(input.value);
        });
        if (!state._searchFocused) {
          input.focus();
          input.setSelectionRange(input.value.length, input.value.length);
          state._searchFocused = true;
        }
      }
    } else {
      state._searchFocused = false;
    }

    window.scrollTo(0, 0);
    shell.classList.remove("menu-open");
    sidebar.classList.remove("open");
  }

  function brandHTML() {
    var name = WORK.name || "Story Kit";
    return '<div class="brand">' +
      '<div class="brand-kicker">' + esc(WORK.kicker || "FANFIC STORY KIT") + "</div>" +
      '<div class="brand-title">' + esc(name) + "<i>STORY</i></div>" +
      '<div class="brand-sub">' + esc(WORK.sub || "主线 · 角色 · 世界观 · 时间线") + "</div></div>";
  }

  function footHTML() {
    var p = WORK.home ? '<a href="' + esc(WORK.home) + '">← 返回作品库</a>' : "";
    return '<div class="sidebar-foot">' + p +
      '<div style="margin-top:6px">' + esc(WORK.footer || "内容仅供同人创作参考，版权归米哈游所有。") + "</div></div>";
  }

  /* ---------------- events ---------------- */

  document.addEventListener("click", function (e) {
    var scrollEl = e.target.closest("[data-scroll]");
    if (scrollEl) {
      var target = document.getElementById(scrollEl.getAttribute("data-scroll"));
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    var goEl = e.target.closest("[data-go]");
    if (goEl) {
      var target = goEl.getAttribute("data-go");
      go(target);
      return;
    }
    var navEl = e.target.closest("[data-nav]");
    if (navEl) {
      var k = navEl.getAttribute("data-nav");
      go("#/" + k);
      return;
    }
    var tab = e.target.closest("[data-season]");
    if (tab) {
      state.season = tab.getAttribute("data-season");
      render();
      return;
    }
    var fac = e.target.closest("[data-faction]");
    if (fac) {
      state.faction = fac.getAttribute("data-faction");
      render();
      return;
    }
    var copyBtn = e.target.closest("[data-copy]");
    if (copyBtn) {
      var chId = parseHash().id;
      var ch = chapterById(chId);
      var sc = ch && ch.scenes[+copyBtn.getAttribute("data-copy")];
      if (sc) copyText(scenePlainText(sc), copyBtn);
      return;
    }
    if (e.target.closest("[data-print]")) {
      window.print();
      return;
    }
    var menuBtn = e.target.closest("#menuBtn");
    if (menuBtn) {
      sidebar.classList.toggle("open");
      shell.classList.toggle("menu-open");
      return;
    }
    if (shell.classList.contains("menu-open") && !e.target.closest(".sidebar")) {
      shell.classList.remove("menu-open");
      sidebar.classList.remove("open");
    }
  });

  function copyText(text, btn) {
    var done = function () {
      var old = btn.textContent;
      btn.textContent = "已复制 ✓";
      setTimeout(function () { btn.textContent = old; }, 1400);
    };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done).catch(function () { fallbackCopy(text); done(); });
    } else {
      fallbackCopy(text); done();
    }
  }

  function fallbackCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch (e) {}
    document.body.removeChild(ta);
  }

  document.addEventListener("keydown", function (e) {
    var typing = /INPUT|TEXTAREA/.test(document.activeElement.tagName);
    if (e.key === "/" && !typing) {
      e.preventDefault();
      go("#/search");
    }
    if (e.key === "Escape" && typing) {
      document.activeElement.blur();
    }
  });

  window.addEventListener("hashchange", render);

  /* ---------------- boot ---------------- */

  buildIndex();
  if (!location.hash) location.replace("#/home");
  render();
})();
