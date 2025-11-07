const API_BASE = '';

const svg = d3.select('#raceSvg');
let width = +svg.attr('width');
const height = +svg.attr('height');

const margin = { top: 40, right: 80, bottom: 60, left: 80 };
let trackX = width / 2;
const startY = height - margin.bottom;
const finishY = margin.top;

const state = {
  data: null,
  articles: [],
  relations: {},
  filterCompany: null,
  filterTarget: null,
};

function drawTrackAt(x, targetName) {
  // Track line
  svg
    .append('line')
    .attr('x1', x)
    .attr('x2', x)
    .attr('y1', startY)
    .attr('y2', finishY)
    .attr('stroke', '#bbb')
    .attr('stroke-width', 6)
    .attr('stroke-linecap', 'round');

  // Start and Finish
  svg
    .append('text')
    .attr('x', x - 20)
    .attr('y', startY + 24)
    .attr('class', 'label')
    .text('출발선');

  svg
    .append('text')
    .attr('x', x - 20)
    .attr('y', finishY - 14)
    .attr('class', 'label')
    .text('결승선');

  svg
    .append('line')
    .attr('x1', x - 40)
    .attr('x2', x + 40)
    .attr('y1', finishY)
    .attr('y2', finishY)
    .attr('stroke', '#e74c3c')
    .attr('stroke-width', 3);

  // Target label at finish
  svg
    .append('text')
    .attr('x', x + 0)
    .attr('y', finishY - 28)
    .attr('text-anchor', 'middle')
    .attr('class', 'racer-label')
    .text(targetName);
}

function ratioToY(r) {
  // r in [0,1], 0=start, 1=finish
  return startY - (startY - finishY) * r;
}

function jitter(amplitude = 6) {
  return (Math.random() * 2 - 1) * amplitude;
}

function renderTracks(relations) {
  svg.selectAll('*').remove();

  const targets = Object.keys(relations);
  const maxTracks = Math.max(1, Math.min(6, targets.length));
  const panelWidth = 200;
  const gap = 40;
  width = maxTracks * panelWidth + (maxTracks - 1) * gap + 2 * margin.left;
  svg.attr('width', width);

  targets.slice(0, maxTracks).forEach((target, idx) => {
    const x = margin.left + idx * (panelWidth + gap) + panelWidth / 2;
    drawTrackAt(x, target);

    const chasers = relations[target].chasers || {};
    const entries = Object.entries(chasers).filter(([c]) => c !== '기타');
    if (!entries.length) return;

    const maxScore = Math.max(...entries.map(([, v]) => v.score || 0), 1);
    entries.sort((a, b) => (b[1].score || 0) - (a[1].score || 0));

    const baseGroup = svg.append('g').attr('class', `track-${idx}`);
    entries.slice(0, 5).forEach(([name, data], i) => {
      const ratio = Math.min(0.97, 0.75 + (data.score / maxScore) * 0.2);
      const y = ratioToY(ratio);
      const xOffset = -60 - i * 18;
      const cx = x + xOffset;
      const color = d3.schemeTableau10[i % 10];

      const node = baseGroup
        .append('g')
        .attr('class', `racer chaser-${i}`)
        .style('cursor', 'pointer');

      node
        .append('circle')
        .attr('cx', cx)
        .attr('cy', y)
        .attr('r', 14)
        .attr('fill', color)
        .attr('stroke', '#222')
        .attr('stroke-width', 1.3);

      node
        .append('text')
        .attr('x', cx)
        .attr('y', y + 28)
        .attr('text-anchor', 'middle')
        .attr('class', 'racer-label')
        .text(name);

      node
        .append('circle')
        .attr('class', 'pulse')
        .attr('cx', cx)
        .attr('cy', y)
        .attr('r', 18)
        .attr('fill', 'none')
        .attr('stroke', color)
        .attr('opacity', 0.0);

      node.on('mouseenter', function () {
        d3.select(this).select('.pulse').transition().duration(200).attr('opacity', 0.6);
      });
      node.on('mouseleave', function () {
        d3.select(this).select('.pulse').transition().duration(200).attr('opacity', 0.0);
      });

      node.on('click', () => {
        state.filterCompany = name;
        state.filterTarget = target;
        renderArticles();
      });

      animateOscillation(node, cx, y);
    });

    // Target clickable to show its related articles
    const targetHotspot = svg
      .append('rect')
      .attr('x', x - 40)
      .attr('y', finishY - 70)
      .attr('width', 80)
      .attr('height', 70)
      .attr('fill', 'transparent')
      .style('cursor', 'pointer')
      .on('click', () => {
        state.filterCompany = null;
        state.filterTarget = target;
        renderArticles();
      });
  });
}

function animateOscillation(node, x, baseY) {
  function loop() {
    node
      .select('circle')
      .transition()
      .duration(900 + Math.random() * 600)
      .ease(d3.easeSinInOut)
      .attr('cy', baseY + jitter(10))
      .on('end', loop);

    node
      .select('.pulse')
      .transition()
      .duration(900)
      .attr('r', 24 + Math.random() * 10)
      .attr('opacity', 0.15 + Math.random() * 0.25);
  }
  loop();
}

function renderArticles() {
  const list = document.getElementById('articlesList');
  const title = document.getElementById('articlesTitle');
  list.innerHTML = '';

  let filtered = state.articles;
  if (state.filterTarget && state.filterCompany) {
    // Filter to articles containing both companies
    filtered = state.articles.filter(
      (a) => a.companies.includes(state.filterTarget) && a.companies.includes(state.filterCompany)
    );
  } else if (state.filterTarget) {
    filtered = state.articles.filter((a) => a.companies.includes(state.filterTarget));
  } else if (state.filterCompany) {
    filtered = state.articles.filter((a) => a.companies.includes(state.filterCompany));
  }

  if (state.filterTarget && state.filterCompany) {
    title.textContent = `관련 기사 · ${state.filterCompany} → ${state.filterTarget}`;
  } else if (state.filterTarget) {
    title.textContent = `관련 기사 · 리더 ${state.filterTarget}`;
  } else if (state.filterCompany) {
    title.textContent = `관련 기사 · ${state.filterCompany}`;
  } else {
    title.textContent = '관련 기사';
  }

  if (!filtered.length) {
    const li = document.createElement('li');
    li.textContent = '표시할 기사가 없습니다.';
    list.appendChild(li);
    return;
  }

  filtered.slice(0, 80).forEach((a) => {
    const li = document.createElement('li');
    const anchor = document.createElement('a');
    anchor.href = a.link;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.textContent = a.title.replace(/<b>|<\/b>/g, '');

    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = a.description.replace(/<b>|<\/b>/g, '');

    const tags = document.createElement('span');
    tags.className = 'tags';
    tags.textContent = a.companies.join(' ');

    li.appendChild(anchor);
    li.appendChild(meta);
    li.appendChild(tags);
    list.appendChild(li);
  });
}

async function fetchNews(query) {
  const res = await fetch(`${API_BASE}/api/news?query=${encodeURIComponent(query)}`);
  if (!res.ok) {
    throw new Error('뉴스를 불러오지 못했습니다');
  }
  return res.json();
}

async function init() {
  try {
    const query = document.getElementById('queryInput').value.trim() || '게섰거라';
    const data = await fetchNews(query);
    state.data = data;
    state.articles = data.articles || [];
    state.relations = data.relations || {};
    renderTracks(state.relations);
    renderArticles();
  } catch (e) {
    console.error(e);
    const list = document.getElementById('articlesList');
    const li = document.createElement('li');
    li.textContent = 'API 오류가 발생했습니다. 서버 설정을 확인하세요.';
    list.appendChild(li);
  }
}

document.getElementById('fetchBtn').addEventListener('click', () => {
  state.filterCompany = null;
  init();
});

init();


