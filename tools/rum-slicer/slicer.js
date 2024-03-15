import { loadArea } from 'https://main--nexter--da-sites.hlx.page/nx/scripts/nexter.js';
loadArea();

// eslint-disable-next-line no-unused-vars, import/no-unresolved
import { DateTime } from 'https://cdn.jsdelivr.net/npm/luxon@3.4.4/+esm';
// eslint-disable-next-line import/no-unresolved
import 'https://cdn.jsdelivr.net/npm/chartjs-adapter-luxon/+esm';

let SAMPLE_BUNDLE;
let DOMAIN_KEY = '';
let DOMAIN = 'www.thinktanked.org';
const API_ENDPOINT = 'https://rum-bundles-2.david8603.workers.dev'

const viewSelect = document.getElementById('view');
const filterInput = document.getElementById('filter');
const facetsElement = document.getElementById('facets');
const canvas = document.getElementById('time-series');
const timezoneElement = document.getElementById('timezone');
const lowDataWarning = document.getElementById('low-data-warning');

let dataChunks = [];

function toISOStringWithTimezone(date) {
  // Pad a number to 2 digits
  const pad = (n) => `${Math.floor(Math.abs(n))}`.padStart(2, '0');

  // Get timezone offset in ISO format (+hh:mm or -hh:mm)
  const getTimezoneOffset = () => {
    const tzOffset = -date.getTimezoneOffset();
    const diff = tzOffset >= 0 ? '+' : '-';
    return `${diff}${pad(tzOffset / 60)}:${pad(tzOffset % 60)}`;
  };

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${getTimezoneOffset()}`;
}

// eslint-disable-next-line no-undef, no-new
const chart = new Chart(canvas, {
  type: 'bar',
  data: {
    labels: [],
    datasets: [{
      label: 'No CVW',
      backgroundColor: '#888',
      data: [],
    },
    {
      label: 'Good',
      backgroundColor: '#49cc93',
      data: [],
    },
    {
      label: 'Needs Improvement',
      backgroundColor: '#ffa037',
      data: [],
    },
    {
      label: 'Poor',
      backgroundColor: '#ff7c65',
      data: [],
    }],
  },
  options: {
    plugins: {
      tooltip: {
        callbacks: {
          label: (context) => {
            const { datasets } = context.chart.data;
            const value = context.parsed.y;
            const i = context.dataIndex;
            const total = datasets.reduce((pv, cv) => pv + cv.data[i], 0);

            return (`${context.dataset.label}: ${Math.round((value / total) * 1000) / 10}%`);
          },
        },
      },
    },
    interaction: {
      mode: 'x',
    },
    animation: {
      duration: 300,
    },
    datasets: {
      bar: {
        barPercentage: 1,
        categoryPercentage: 0.9,
        borderSkipped: false,
        borderRadius: {
          topLeft: 3,
          topRight: 3,
          bottomLeft: 3,
          bottomRight: 3,
        },
      },
    },
    responsive: true,
    scales: {
      x: {
        type: 'time',
        display: true,
        offset: true,
        time: {
          unit: 'day',
        },
        stacked: true,
        ticks: {
          minRotation: 90,
          maxRotation: 90,
          autoSkip: false,
        },
      },
      y: {
        stacked: true,
      },
    },
  },
});

function toHumanReadable(num) {
  const dp = 3;
  let number = num;
  const thresh = 1000;

  if (Math.abs(num) < thresh) {
    const precision = (Math.log10(number) < 0) ? 2 : (dp - 1) - Math.floor(Math.log10(number));
    return `${number.toFixed(precision)}`;
  }

  const units = ['k', 'm', 'g', 't', 'p'];
  let u = -1;
  const r = 10 ** dp;

  do {
    number /= thresh;
    u += 1;
  } while (Math.round(Math.abs(number) * r) / r >= thresh && u < units.length - 1);

  const precision = (dp - 1) - Math.floor(Math.log10(number));
  return `${number.toFixed(precision)}${units[u]}`;
}

async function loadSampleBundle() {
  const resp = await fetch('./sampleRUMBundle.json');
  return (resp.json());
}

async function createRandomBundle(date, hour) {
  if (!SAMPLE_BUNDLE) {
    SAMPLE_BUNDLE = await loadSampleBundle();
  }
  const sampleURLs = ['https://www.thinktanked.org/', 'https://www.thinktanked.org/pretzels', 'https://www.thinktanked.org/iba-testing'];
  const bundle = structuredClone(SAMPLE_BUNDLE);
  bundle.id = `${Math.random()}`;
  bundle.user_agent = Math.random() < 0.3 ? 'desktop' : 'mobile';
  bundle.url = sampleURLs[Math.floor(Math.random() * 3)];
  bundle.timeSlot = `${date}T${hour}:00:00Z`;

  // deal with inp
  if (Math.random() < 0.5) bundle.events.splice(10, 1);
  else bundle.events[10].target = Math.floor(Math.random() * 600);

  // deal with cls
  if (Math.random() < 0.5) bundle.events.splice(9, 1);
  else bundle.events[9].target = Math.random() * 0.3;

  // deal with lcp
  if (Math.random() < 0.5) bundle.events.splice(8, 1);
  else bundle.events[8].target = Math.floor(Math.random() * 5000);

  // remove leave
  if (Math.random() < 0.3) bundle.events.splice(6, 1);
  // remove enter
  if (Math.random() < 0.3) bundle.events.splice(3, 1);

  return (bundle);
}

async function generateRandomRUMBundles(num, date, hour) {
  const bundles = [];
  for (let i = 0; i < num; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const bundle = await createRandomBundle(date, (`${hour}`).padStart(2, '0'));
    bundles.push(bundle);
  }
  return (bundles);
}

function addCalculatedProps(bundle) {
  bundle.events.forEach((e) => {
    if (e.checkpoint === 'enter') {
      bundle.visit = true;
    }
    if (e.checkpoint === 'click') {
      bundle.conversion = true;
    }
    if (e.checkpoint === 'cwv-inp') {
      bundle.cwvINP = e.value;
    }
    if (e.checkpoint === 'cwv-lcp') {
      bundle.cwvLCP = e.value;
    }
    if (e.checkpoint === 'cwv-cls') {
      bundle.cwvCLS = e.value;
    }
  });
}

async function fetchUTCDay(utcISOString) {
  const [date] = utcISOString.split('T');
  const datePath = date.split('-').join('/');
  const apiRequestURL = `${API_ENDPOINT}/rum-bundles/${DOMAIN}/${datePath}?domainkey=${DOMAIN_KEY}`;
  const resp = await fetch(apiRequestURL);
  const json = await resp.json();
  const { rumBundles } = json;
  /*
  const rumBundles = [];
  for (let hour = 0; hour < 24; hour += 1) {
    // eslint-disable-next-line no-await-in-loop
    const hourBundles = await generateRandomRUMBundles(Math.random() * 100, date, hour);
    hourBundles.forEach((bundle) => addCalculatedProps(bundle));
    rumBundles.push(...hourBundles);
  }
  */
  rumBundles.forEach((bundle) => addCalculatedProps(bundle));
  return { date, rumBundles };
}

async function fetchUTCHour(utcISOString) {
  const [date, time] = utcISOString.split('T');
  const datePath = date.split('-').join('/');
  const hour = time.split(':')[0];
  const apiRequestURL = `${API_ENDPOINT}/rum-bundles/${DOMAIN}/${datePath}/${hour}?domainkey=${DOMAIN_KEY}`;
  console.log(apiRequestURL);
  const resp = await fetch(apiRequestURL);
  const json = await resp.json();
  const { rumBundles } = json;
  /*
  const rumBundles = await generateRandomRUMBundles(Math.random() * 100, date, hour);
  */
  rumBundles.forEach((bundle) => addCalculatedProps(bundle));
  return { date, hour, rumBundles };
}

export function setDomain(domain, key) {
  DOMAIN = domain;
  DOMAIN_KEY = key;
}

export async function fetchLastWeek() {
  const chunks = [];
  const date = new Date();
  const hoursInWeek = 7 * 24;
  for (let i = 0; i < hoursInWeek; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    chunks.unshift(await fetchUTCHour(date.toISOString()));
    date.setTime(date.getTime() - (3600 * 1000));
  }
  return chunks;
}

export async function fetchLast31Days() {
  const chunks = [];
  const date = new Date();
  const days = 31;
  for (let i = 0; i < days; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    chunks.unshift(await fetchUTCDay(date.toISOString()));
    date.setDate(date.getDate() - 1);
  }
  return chunks;
}

function filterBundle(bundle, filter, facets, cwv) {
  let matchedAll = true;
  const filterMatches = {};

  /* create sub facets */
  filter.checkpoint.forEach((cp) => {
    if (!facets[`${cp}.target`]) {
      facets[`${cp}.target`] = {};
      cwv[`${cp}.target`] = {};
    }
    if (!facets[`${cp}.source`]) {
      facets[`${cp}.source`] = {};
      cwv[`${cp}.source`] = {};
    }
  });

  filterMatches.text = true;
  if (!bundle.url.includes(filter.text)) {
    matchedAll = false;
    filterMatches.text = false;
  }

  const checkpointEvents = {};
  const checkpoints = bundle.events.map((e) => {
    if (!checkpointEvents[e.checkpoint]) checkpointEvents[e.checkpoint] = [];
    checkpointEvents[e.checkpoint].push(e);
    return (e.checkpoint);
  });

  /* filter checkpoint */
  if (matchedAll) {
    if (filter.checkpoint.length) {
      if (filter.checkpoint.every((cp) => checkpoints.includes(cp))) {
        filterMatches.checkpoint = true;
      } else {
        matchedAll = false;
        filterMatches.checkpoint = false;
      }
    }
  }

  /* filter url */
  if (matchedAll) {
    if (filter.url.length) {
      if (filter.url.includes(bundle.url)) {
        filterMatches.url = true;
      } else {
        matchedAll = false;
        filterMatches.url = false;
      }
    }
  }

  /* filter user_agent */
  if (matchedAll) {
    if (filter.user_agent.length) {
      if (filter.user_agent.includes(bundle.user_agent)) {
        filterMatches.user_agent = true;
      } else {
        matchedAll = false;
        filterMatches.user_agent = false;
      }
    }
  }

  const matchedEverythingElse = (facetName) => {
    let includeInFacet = true;
    Object.keys(filterMatches).forEach((filterKey) => {
      if (filterKey !== facetName && !filterMatches[filterKey]) includeInFacet = false;
    });
    return includeInFacet;
  };

  const addToCWV = (facet, option) => {
    const addMetric = (metric) => {
      if (!cwv[facet][option]) cwv[facet][option] = {};
      if (!cwv[facet][option][metric]) cwv[facet][option][metric] = { weight: 0, bundles: [] };
      const m = cwv[facet][option][metric];
      m.bundles.push(bundle);
      m.weight += bundle.weight;
    };
    if (bundle.cwvLCP) addMetric('lcp');
    if (bundle.cwvCLS) addMetric('cls');
    if (bundle.cwvINP) addMetric('inp');
  };

  /* facets */
  if (matchedAll) {
    checkpoints.forEach((val) => {
      if (facets.checkpoint[val]) facets.checkpoint[val] += bundle.weight;
      else facets.checkpoint[val] = bundle.weight;
      addToCWV('checkpoint', val);
      if (filter.checkpoint.includes(val)) {
        checkpointEvents[val].forEach((e) => {
          if (e.target) {
            const facetName = `${val}.target`;
            const facet = facets[facetName];
            const option = e.target;

            if (facet[option]) {
              facet[option] += bundle.weight;
            } else {
              facet[option] = bundle.weight;
            }
            addToCWV(facetName, option);
          }
          if (e.source) {
            const facetName = `${val}.source`;
            const facet = facets[facetName];
            const option = e.source;

            if (facet[option]) {
              facet[option] += bundle.weight;
            } else {
              facet[option] = bundle.weight;
            }
            addToCWV(facetName, option);
          }
        });
      }
    });
  }

  if (matchedEverythingElse('url')) {
    if (facets.url[bundle.url]) facets.url[bundle.url] += bundle.weight;
    else facets.url[bundle.url] = bundle.weight;
    addToCWV('url', bundle.url);
  }

  if (matchedEverythingElse('user_agent')) {
    if (facets.user_agent[bundle.user_agent]) facets.user_agent[bundle.user_agent] += bundle.weight;
    else facets.user_agent[bundle.user_agent] = bundle.weight;
    addToCWV('user_agent', bundle.user_agent);
  }

  return (matchedAll);
}

function scoreValue(value, ni, poor) {
  if (value >= poor) return 'poor';
  if (value >= ni) return 'ni';
  return 'good';
}

function scoreCWV(value, name) {
  const limits = {
    lcp: [2500, 4000],
    cls: [0.1, 0.25],
    inp: [200, 500],
  };
  return scoreValue(value, ...limits[name]);
}

function updateKeyMetrics(keyMetrics) {
  document.querySelector('#pageviews p').textContent = toHumanReadable(keyMetrics.pageViews);
  document.querySelector('#visits p').textContent = toHumanReadable(keyMetrics.visits);
  document.querySelector('#conversions p').textContent = toHumanReadable(keyMetrics.conversions);

  const lcpElem = document.querySelector('#lcp p');
  lcpElem.textContent = `${toHumanReadable(keyMetrics.lcp / 1000)} s`;
  lcpElem.closest('li').className = `score-${scoreCWV(keyMetrics.lcp, 'lcp')}`;

  const clsElem = document.querySelector('#cls p');
  clsElem.textContent = `${toHumanReadable(keyMetrics.cls)}`;
  clsElem.closest('li').className = `score-${scoreCWV(keyMetrics.cls, 'cls')}`;

  const inpElem = document.querySelector('#inp p');
  inpElem.textContent = `${toHumanReadable(keyMetrics.inp / 1000)} s`;
  inpElem.closest('li').className = `score-${scoreCWV(keyMetrics.inp, 'inp')}`;
}

function createChartData(bundles, config) {
  const labels = [];
  const datasets = [];

  const stats = {};
  const cwvStructure = () => ({
    bundles: [],
    weight: 0,
    average: 0,
    good: { weight: 0, average: 0 },
    ni: { weight: 0, average: 0 },
    poor: { weight: 0, average: 0 },
  });

  bundles.forEach((bundle) => {
    const slotTime = new Date(bundle.timeSlot);
    if (config.unit === 'day') slotTime.setHours(0);

    const localTimeSlot = toISOStringWithTimezone(slotTime);
    if (!stats[localTimeSlot]) {
      const s = {
        total: 0,
        conversions: 0,
        visits: 0,
        lcp: cwvStructure(),
        inp: cwvStructure(),
        cls: cwvStructure(),
      };

      stats[localTimeSlot] = s;
    }

    const updateAverage = (b, struct, key) => {
      const newWeight = b.weight + struct.weight;
      struct.average = (
        (struct.average * struct.weight)
        + (b[key] * b.weight)
      ) / newWeight;
      struct.weight = newWeight;
    };

    const stat = stats[localTimeSlot];
    stat.total += bundle.weight;
    if (bundle.conversion) stat.conversions += bundle.weight;
    if (bundle.visit) stat.visits += bundle.weight;

    if (bundle.cwvLCP) {
      const score = scoreCWV(bundle.cwvLCP, 'lcp');
      const bucket = stat.lcp[score];
      updateAverage(bundle, bucket, 'cwvLCP');
      updateAverage(bundle, stat.lcp, 'cwvLCP');
      stat.lcp.bundles.push(bundle);
    }
    if (bundle.cwvCLS) {
      const score = scoreCWV(bundle.cwvCLS, 'cls');
      const bucket = stat.cls[score];
      updateAverage(bundle, bucket, 'cwvCLS');
      updateAverage(bundle, stat.cls, 'cwvCLS');
      stat.cls.bundles.push(bundle);
    }
    if (bundle.cwvINP) {
      const score = scoreCWV(bundle.cwvINP, 'inp');
      const bucket = stat.inp[score];
      updateAverage(bundle, bucket, 'cwvINP');
      updateAverage(bundle, stat.inp, 'cwvINP');
      stat.inp.bundles.push(bundle);
    }
  });

  const dataTotal = [];
  const dataGood = [];
  const dataNI = [];
  const dataPoor = [];

  const date = new Date();
  date.setMinutes(0);
  date.setSeconds(0);
  if (config.unit === 'day') date.setHours(0);

  for (let i = 0; i < config.units; i += 1) {
    const localTimeSlot = toISOStringWithTimezone(date);
    const stat = stats[localTimeSlot];
    // eslint-disable-next-line no-undef
    labels.unshift(localTimeSlot);
    const sumBucket = (bucket) => {
      bucket.weight = bucket.good.weight + bucket.ni.weight + bucket.poor.weight;
      if (bucket.weight) {
        bucket.average = ((bucket.good.weight * bucket.good.average)
      + (bucket.ni.weight * bucket.ni.average)
      + (bucket.poor.weight * bucket.poor.average)) / bucket.weight;
      } else {
        bucket.average = 0;
      }
    };

    if (stat) {
      sumBucket(stat.lcp);
      sumBucket(stat.cls);
      sumBucket(stat.inp);

      const cwvNumBundles = stat.lcp.bundles.length
      + stat.cls.bundles.length + stat.inp.bundles.length;
      const cwvTotal = stat.lcp.weight + stat.cls.weight + stat.inp.weight;
      const cwvFactor = stat.total / cwvTotal;

      const cwvGood = stat.lcp.good.weight + stat.cls.good.weight + stat.inp.good.weight;
      const cwvNI = stat.lcp.ni.weight + stat.cls.ni.weight + stat.inp.ni.weight;
      const cwvPoor = stat.lcp.poor.weight + stat.cls.poor.weight + stat.inp.poor.weight;

      const showCWVSplit = cwvNumBundles && (cwvNumBundles > 10);
      dataTotal.unshift(showCWVSplit ? 0 : stat.total);
      dataGood.unshift(showCWVSplit ? Math.round(cwvGood * cwvFactor) : 0);
      dataNI.unshift(showCWVSplit ? Math.round(cwvNI * cwvFactor) : 0);
      dataPoor.unshift(showCWVSplit ? Math.round(cwvPoor * cwvFactor) : 0);
    } else {
      dataTotal.unshift(0);
      dataGood.unshift(0);
      dataNI.unshift(0);
      dataPoor.unshift(0);
    }

    if (config.unit === 'hour') date.setTime(date.getTime() - (3600 * 1000));
    if (config.unit === 'day') date.setDate(date.getDate() - 1);
  }

  datasets.push({ data: dataTotal });
  datasets.push({ data: dataGood });
  datasets.push({ data: dataNI });
  datasets.push({ data: dataPoor });

  return { labels, datasets, stats };
}

function updateFacets(facets, cwv) {
  const url = new URL(window.location);

  facetsElement.textContent = '';
  const keys = Object.keys(facets);
  keys.forEach((facetName) => {
    const facet = facets[facetName];
    const optionKeys = Object.keys(facet);
    if (optionKeys.length) {
      const fieldSet = document.createElement('fieldset');
      const legend = document.createElement('legend');
      legend.textContent = facetName;
      fieldSet.append(legend);
      optionKeys.sort((a, b) => facet[b] - facet[a]);
      optionKeys.forEach((optionKey, i) => {
        if (i < 10) {
          const optionValue = facet[optionKey];
          const div = document.createElement('div');
          const input = document.createElement('input');
          input.type = 'checkbox';
          input.value = optionKey;
          input.checked = url.searchParams.getAll(facetName).includes(optionKey);
          if (input.checked) div.ariaSelected = true;
          input.id = `${facetName}-${optionKey}`;
          div.addEventListener('click', (evt) => {
            if (evt.target !== input) input.checked = !input.checked;
            evt.stopPropagation();
            // eslint-disable-next-line no-use-before-define
            updateState();
            // eslint-disable-next-line no-use-before-define
            draw();
          });
          const createLabelHTML = (labelText) => {
            if (labelText.startsWith('https://') && labelText.includes('media_')) {
              return `<img src="${labelText}?width=2000&format=png&optimize=medium"">`;
            }

            if (labelText.startsWith('https://')) {
              return `<a href="${labelText}" target="_new">${labelText}</a>`;
            }
            return (labelText);
          };

          const label = document.createElement('label');
          label.setAttribute('for', `${facetName}-${optionKey}`);
          label.innerHTML = `${createLabelHTML(optionKey)} (${toHumanReadable(optionValue)})`;

          const getP75 = (metric) => {
            const cwvMetric = `cwv${metric.toUpperCase()}`;
            const optionMetric = cwv[facetName][optionKey][metric];
            optionMetric.bundles.sort((a, b) => a[cwvMetric] - b[cwvMetric]);
            let p75Weight = optionMetric.weight * 0.75;
            let p75Value;
            for (let j = 0; j < optionMetric.bundles.length; j += 1) {
              p75Weight -= optionMetric.bundles[j].weight;
              if (p75Weight < 0) {
                p75Value = optionMetric.bundles[j][cwvMetric];
                break;
              }
            }
            return (p75Value);
          };

          const ul = document.createElement('ul');
          ul.classList.add('cwv');

          // display core web vital to facets
          if (cwv[facetName]) {
            // add lcp
            let lcp = '-';
            let lcpScore = '';
            if (cwv[facetName][optionKey] && cwv[facetName][optionKey].lcp) {
              const lcpValue = getP75('lcp');
              lcp = `${toHumanReadable(lcpValue / 1000)} s`;
              lcpScore = scoreCWV(lcpValue, 'lcp');
            }
            const lcpLI = document.createElement('li');
            lcpLI.classList.add(`score-${lcpScore}`);
            lcpLI.textContent = lcp;
            ul.append(lcpLI);

            // add cls
            let cls = '-';
            let clsScore = '';
            if (cwv[facetName][optionKey] && cwv[facetName][optionKey].cls) {
              const clsValue = getP75('cls');
              cls = `${toHumanReadable(clsValue)}`;
              clsScore = scoreCWV(clsValue, 'cls');
            }
            const clsLI = document.createElement('li');
            clsLI.classList.add(`score-${clsScore}`);
            clsLI.textContent = cls;
            ul.append(clsLI);

            // add inp
            let inp = '-';
            let inpScore = '';
            if (cwv[facetName][optionKey] && cwv[facetName][optionKey].inp) {
              const inpValue = getP75('inp');
              inp = `${toHumanReadable(inpValue / 1000)} s`;
              inpScore = scoreCWV(inpValue, 'inp');
            }
            const inpLI = document.createElement('li');
            inpLI.classList.add(`score-${inpScore}`);
            inpLI.textContent = inp;
            ul.append(inpLI);
          }

          div.append(input, label, ul);
          fieldSet.append(div);
        }
      });
      facetsElement.append(fieldSet);
    }
  });
}

async function draw() {
  const params = new URL(window.location).searchParams;
  const checkpoint = params.getAll('checkpoint');
  const target = params.getAll('target');
  const url = params.getAll('url');
  const user_agent = params.getAll('user_agent');
  const view = params.get('view') || 'week';

  const filterText = params.get('filter') || '';
  const filtered = [];
  const filter = {
    text: filterText,
    checkpoint,
    target,
    url,
    user_agent,
  };

  const facets = {
    user_agent: {},
    url: {},
    checkpoint: {},
  };

  const cwv = structuredClone(facets);

  dataChunks.forEach((chunk) => {
    filtered.push(...chunk.rumBundles
      .filter((bundle) => filterBundle(bundle, filter, facets, cwv)));
  });

  if (filtered.length < 1000) {
    lowDataWarning.ariaHidden = 'false';
  } else {
    lowDataWarning.ariaHidden = 'true';
  }

  const config = view === 'month' ? {
    view,
    unit: 'day',
    units: 30,
  } : {
    view,
    unit: 'hour',
    units: 24 * 7,
  };
  const { labels, datasets, stats } = createChartData(filtered, config);
  datasets.forEach((ds, i) => {
    chart.data.datasets[i].data = ds.data;
  });
  chart.data.labels = labels;
  chart.options.scales.x.time.unit = config.unit;
  chart.update();
  updateFacets(facets, cwv);
  const statsKeys = Object.keys(stats);

  const getAverage = (metric) => {
    const avg = statsKeys.reduce((cv, nv) => (stats[nv][metric].weight ? {
      weight: cv.weight + stats[nv].lcp.weight,
      average: ((cv.average * cv.weight)
      + (stats[nv][metric].average * stats[nv].lcp.weight))
      / (cv.weight + stats[nv][metric].weight),
    } : cv), { average: 0, weight: 0 });
    return avg.average;
  };

  const getP75 = (metric) => {
    const cwvMetric = `cwv${metric.toUpperCase()}`;
    const totalWeight = statsKeys.reduce((cv, nv) => (cv + stats[nv][metric].weight), 0);
    const allBundles = [];
    statsKeys.forEach((key) => allBundles.push(...stats[key][metric].bundles));
    allBundles.sort((a, b) => a[cwvMetric] - b[cwvMetric]);
    let p75Weight = totalWeight * 0.75;
    let p75Value;
    for (let i = 0; i < allBundles.length; i += 1) {
      p75Weight -= allBundles[i].weight;
      if (p75Weight < 0) {
        p75Value = allBundles[i][cwvMetric];
        break;
      }
    }
    return (p75Value);
  };

  const keyMetrics = {
    pageViews: statsKeys.reduce((cv, nv) => cv + stats[nv].total, 0),
    lcp: getP75('lcp'),
    cls: getP75('cls'),
    inp: getP75('inp'),
    conversions: statsKeys.reduce((cv, nv) => cv + stats[nv].conversions, 0),
    visits: statsKeys.reduce((cv, nv) => cv + stats[nv].visits, 0),
  };

  updateKeyMetrics(keyMetrics);
}

async function loadData(scope) {
  if (scope === 'week') {
    dataChunks = await fetchLastWeek();
  }
  if (scope === 'month') {
    dataChunks = await fetchLast31Days();
  }

  draw();
}

function updateState() {
  const url = new URL(window.location.href.split('?')[0]);
  url.searchParams.set('domain', DOMAIN);
  url.searchParams.set('filter', filterInput.value);
  url.searchParams.set('view', viewSelect.value);

  facetsElement.querySelectorAll('input').forEach((e) => {
    if (e.checked) {
      url.searchParams.append(e.id.split('-')[0], e.value);
    }
  });
  url.searchParams.set('domainkey', DOMAIN_KEY);
  window.history.replaceState({}, '', url);
}
const params = new URL(window.location).searchParams;
filterInput.value = params.get('filter');
const view = params.get('view') || 'week';
viewSelect.value = view;
DOMAIN = params.get('domain') || 'www.thinktanked.org';
DOMAIN_KEY = params.get('domainkey') || '';
const h1 = document.querySelector('h1');
h1.textContent = ` ${DOMAIN}`;
const img = document.createElement('img');
img.src = `https://${DOMAIN}/favicon.ico`;
h1.prepend(img);

const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
timezoneElement.textContent = timezone;

loadData(view);

filterInput.addEventListener('input', () => {
  updateState();
  draw();
});

viewSelect.addEventListener('input', () => {
  updateState();
  window.location.reload();
});
