import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

const DAEJEON_CENTER = { lat: 36.3504, lng: 127.3845 }
const DEFAULT_ROWS = 500
const MAX_LOCATION_LOOKUPS = 120
const LATEST_ACCIDENT_YEAR = String(new Date().getFullYear() - 1)
const DAEJEON_REGION_NAME = '대전광역시'
const DAEJEON_GU_GUN_CODES = ['110', '140', '170', '200', '230']
const playFacilityLocationCache = new Map()

const env = import.meta.env

const DATASETS = [
  {
    id: '15110685',
    name: '대전 보안등',
    group: '도로시설',
    color: '#f5a524',
    sourceUrl: 'https://www.data.go.kr/data/15110685/openapi.do',
    endpoint: '/data-api/6300000/GetScltListService1/getScltList1',
    description: '보안등 위치명, 도로명주소, 위도/경도, 설치 수량',
  },
  {
    id: '15058311',
    name: '스쿨존 어린이 사고다발',
    group: '교통사고',
    color: '#e5484d',
    sourceUrl: 'https://www.data.go.kr/data/15058311/openapi.do',
    endpoint: '/data-api/B552061/schoolzoneChild/getRestSchoolzoneChild',
    serviceKeyParam: 'ServiceKey',
    description: '어린이보호구역 내 어린이 교통사고 다발지역',
    query: ({ accidentYear }) =>
      DAEJEON_GU_GUN_CODES.map((guGun) => ({
        searchYearCd: accidentYear,
        siDo: '30',
        guGun,
        type: 'json',
      })),
  },
  {
    id: '15058925',
    name: '보행어린이 사고다발',
    group: '교통사고',
    color: '#d6409f',
    sourceUrl: 'https://www.data.go.kr/data/15058925/openapi.do',
    endpoint: '/data-api/B552061/frequentzoneChild/getRestFrequentzoneChild',
    serviceKeyParam: 'ServiceKey',
    description: '12세 이하 보행어린이 교통사고 다발지역',
    query: ({ accidentYear }) =>
      DAEJEON_GU_GUN_CODES.map((guGun) => ({
        searchYearCd: accidentYear,
        siDo: '30',
        guGun,
        type: 'json',
      })),
  },
  {
    id: '15110672',
    name: '대전 횡단보도',
    group: '도로시설',
    color: '#46a758',
    sourceUrl: 'https://www.data.go.kr/data/15110672/openapi.do',
    endpoint: '/data-api/6300000/GetPdcrListService1/getPdcrList1',
    description: '횡단보도 위치, 도로명주소, 연장, 폭',
  },
  {
    id: '15007270',
    name: '대전 도시공원',
    group: '생활시설',
    color: '#2f9e44',
    sourceUrl: 'https://www.data.go.kr/data/15007270/openapi.do',
    endpoint: '/data-api/6300000/parkInfoDaejeonService/parkInfoDaejeonList',
    description: '공원명, 주소, 면적, 공원구분, 관리기관',
  },
  {
    id: '15124527',
    name: '우수 어린이놀이시설',
    group: '어린이놀이시설',
    color: '#3e63dd',
    sourceUrl: 'https://www.data.go.kr/data/15124527/openapi.do',
    endpoint: '/data-api/1741000/exfc5/getExfc5',
    description: '전국 어린이놀이시설 우수시설 지정 정보',
    query: () => ({
      pageIndex: '1',
      recordCountPerPage: String(DEFAULT_ROWS),
      rgnNm: DAEJEON_REGION_NAME,
    }),
  },
  {
    id: '15124524',
    name: '놀이시설 안전검사',
    group: '어린이놀이시설',
    color: '#0090ff',
    sourceUrl: 'https://www.data.go.kr/data/15124524/openapi.do',
    endpoint: '/data-api/1741000/sfty4/getSftyInsp4',
    locationLookup: 'playFacility',
    description: '놀이시설별 안전검사 종류, 검사일, 판정',
    query: () => ({
      pageIndex: '1',
      recordCountPerPage: String(DEFAULT_ROWS),
      rgnNm: DAEJEON_REGION_NAME,
    }),
  },
  {
    id: '15124521',
    name: '놀이시설 기구정보',
    group: '어린이놀이시설',
    color: '#7c3aed',
    sourceUrl: 'https://www.data.go.kr/data/15124521/openapi.do',
    endpoint: '/data-api/1741000/ride4/getRide4',
    locationLookup: 'playFacility',
    description: '놀이시설명, 기구명, 설치장소, 설치일자',
    query: () => ({
      pageIndex: '1',
      recordCountPerPage: String(DEFAULT_ROWS),
      rgnNm: DAEJEON_REGION_NAME,
    }),
  },
  {
    id: '15124519',
    name: '어린이놀이시설',
    group: '어린이놀이시설',
    color: '#00a2c7',
    sourceUrl: 'https://www.data.go.kr/data/15124519/openapi.do',
    endpoint: '/data-api/1741000/pfc3/getPfctInfo3',
    description: '놀이시설명, 주소 등 기본 위치 정보',
    query: () => ({
      pageIndex: '1',
      recordCountPerPage: String(DEFAULT_ROWS),
    }),
  },
  {
    id: '15110706',
    name: '대전 신호등',
    group: '도로시설',
    color: '#f76b15',
    sourceUrl: 'https://www.data.go.kr/data/15110706/openapi.do',
    endpoint: '/data-api/6300000/GetTrsnListService1/getTrsnList1',
    description: '신호등 위치, 구분, 색 종류, 도로명주소',
  },
]

const FIELD_LABELS = {
  address: '주소',
  accidents: '사고건수',
  accidentCount: '사고건수',
  cnt: '건수',
  count: '수량',
  cs: '사상자수',
  death: '사망자수',
  facilityName: '시설명',
  instlCo: '설치개수',
  latitude: '위도',
  longitude: '경도',
  manageInstitution: '관리기관',
  name: '이름',
  parkArea: '면적',
  section: '구분',
  tel: '연락처',
  title: '명칭',
}

const LAT_KEYS = [
  'lat',
  'latitude',
  'latCrtsVl',
  'la',
  'laCrd',
  'la_crd',
  'y',
  '위도',
  'LAT',
  'LATI',
]
const LNG_KEYS = [
  'lng',
  'lon',
  'lotCrtsVl',
  'long',
  'longitude',
  'lo',
  'loCrd',
  'lo_crd',
  'x',
  '경도',
  'LOT',
  'LON',
]
const NAME_KEYS = [
  'title',
  'name',
  'facilityName',
  'fcltyNm',
  'facltNm',
  'pfctNm',
  'playFcltyNm',
  'spot_nm',
  'spotNm',
  'afos_fid',
  '위치명',
  '시설명',
  '공원명',
  '놀이시설명',
]
const ADDRESS_KEYS = [
  'address',
  'roadAddress',
  'ronaAddr',
  'ronaDaddr',
  'lotnoAddr',
  'lotnoDaddr',
  'rdnmadr',
  'lnmadr',
  'addr',
  'adres',
  'jibunAddress',
  '도로명주소',
  '소재지도로명주소',
  '소재지지번주소',
  '주소',
]

function App() {
  const mapContainerRef = useRef(null)
  const mapRef = useRef(null)
  const geocoderRef = useRef(null)
  const clustererRef = useRef(null)
  const markerRefs = useRef([])
  const circleRefs = useRef([])
  const infoWindowRef = useRef(null)
  const autoLoadedRef = useRef(false)

  const kakaoKey = env.VITE_KAKAO_MAP_APP_KEY || ''
  const dataKey = env.VITE_DATA_GO_KR_SERVICE_KEY || ''
  const accidentYear = LATEST_ACCIDENT_YEAR
  const [mapState, setMapState] = useState({
    ready: false,
    loading: false,
    error: '',
  })
  const [results, setResults] = useState(() =>
    Object.fromEntries(
      DATASETS.map((dataset) => [
        dataset.id,
        {
          status: dataset.endpoint ? 'idle' : 'needs-endpoint',
          rawCount: 0,
          mappedCount: 0,
          records: [],
          error: '',
        },
      ]),
    ),
  )
  const [enabled, setEnabled] = useState(() =>
    Object.fromEntries(DATASETS.map((dataset) => [dataset.id, true])),
  )
  const [selectedGroup, setSelectedGroup] = useState('all')
  const [isLoadingData, setIsLoadingData] = useState(false)

  const groups = useMemo(
    () => ['all', ...new Set(DATASETS.map((dataset) => dataset.group))],
    [],
  )

  const activeRecords = useMemo(() => {
    return DATASETS.flatMap((dataset) => {
      if (!enabled[dataset.id]) return []
      if (selectedGroup !== 'all' && dataset.group !== selectedGroup) return []
      return results[dataset.id]?.records || []
    })
  }, [enabled, results, selectedGroup])

  const totals = useMemo(() => {
    const loaded = DATASETS.reduce(
      (sum, dataset) => sum + (results[dataset.id]?.mappedCount || 0),
      0,
    )
    const connected = DATASETS.filter((dataset) => dataset.endpoint).length
    const errors = DATASETS.filter(
      (dataset) => results[dataset.id]?.status === 'error',
    ).length

    return { loaded, connected, errors }
  }, [results])

  const loadKakaoMap = useCallback(() => {
    if (!kakaoKey.trim()) {
      setMapState({
        ready: false,
        loading: false,
        error: '카카오맵 JavaScript 키를 입력하세요.',
      })
      return
    }

    if (window.kakao?.maps && mapRef.current) {
      setMapState({ ready: true, loading: false, error: '' })
      return
    }

    setMapState({ ready: false, loading: true, error: '' })

    const existingScript = document.querySelector('script[data-kakao-map-sdk]')
    const loadMap = () => {
      window.kakao.maps.load(() => {
        const center = new window.kakao.maps.LatLng(
          DAEJEON_CENTER.lat,
          DAEJEON_CENTER.lng,
        )
        const map = new window.kakao.maps.Map(mapContainerRef.current, {
          center,
          level: 7,
        })

        map.addControl(
          new window.kakao.maps.ZoomControl(),
          window.kakao.maps.ControlPosition.RIGHT,
        )
        mapRef.current = map
        geocoderRef.current = new window.kakao.maps.services.Geocoder()
        infoWindowRef.current = new window.kakao.maps.InfoWindow({
          removable: false,
          zIndex: 10,
        })

        if (window.kakao.maps.MarkerClusterer) {
          clustererRef.current = new window.kakao.maps.MarkerClusterer({
            map,
            averageCenter: true,
            minLevel: 6,
            gridSize: 48,
          })
        }

        setMapState({ ready: true, loading: false, error: '' })
      })
    }

    if (existingScript) {
      if (window.kakao?.maps) {
        loadMap()
      } else {
        existingScript.addEventListener('load', loadMap, { once: true })
      }
      return
    }

    const script = document.createElement('script')
    script.dataset.kakaoMapSdk = 'true'
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(
      kakaoKey.trim(),
    )}&autoload=false&libraries=services,clusterer`
    script.async = true
    script.onload = loadMap
    script.onerror = () =>
      setMapState({
        ready: false,
        loading: false,
        error: '카카오맵 SDK를 불러오지 못했습니다. 키와 도메인 등록을 확인하세요.',
      })
    document.head.appendChild(script)
  }, [kakaoKey])

  useEffect(() => {
    if (!mapContainerRef.current) return
    loadKakaoMap()
  }, [loadKakaoMap])

  useEffect(() => {
    if (!mapState.ready || !mapRef.current) return

    markerRefs.current.forEach((marker) => marker.setMap(null))
    markerRefs.current = []
    circleRefs.current.forEach((circle) => circle.setMap(null))
    circleRefs.current = []
    clustererRef.current?.clear()
    infoWindowRef.current?.close()

    if (!activeRecords.length) return

    const bounds = new window.kakao.maps.LatLngBounds()
    const markers = activeRecords.map((record) => {
      const position = new window.kakao.maps.LatLng(record.lat, record.lng)
      const marker = new window.kakao.maps.Marker({
        position,
        title: record.title,
        image: createMarkerImage(record.color),
      })
      const circle = new window.kakao.maps.Circle({
        map: mapRef.current,
        center: position,
        radius: getRecordRadius(record),
        strokeWeight: 2,
        strokeColor: record.color,
        strokeOpacity: 0.85,
        fillColor: record.color,
        fillOpacity: 0.16,
        zIndex: 1,
      })

      window.kakao.maps.event.addListener(marker, 'mouseover', () => {
        infoWindowRef.current.setContent(renderHoverContent(record))
        infoWindowRef.current.open(mapRef.current, marker)
        circle.setOptions({ fillOpacity: 0.28, strokeWeight: 4 })
      })
      window.kakao.maps.event.addListener(marker, 'mouseout', () => {
        infoWindowRef.current.close()
        circle.setOptions({ fillOpacity: 0.16, strokeWeight: 2 })
      })

      bounds.extend(position)
      circleRefs.current.push(circle)
      return marker
    })

    markerRefs.current = markers

    if (clustererRef.current) {
      clustererRef.current.addMarkers(markers)
    } else {
      markers.forEach((marker) => marker.setMap(mapRef.current))
    }

    if (markers.length === 1) {
      mapRef.current.setCenter(markers[0].getPosition())
      mapRef.current.setLevel(4)
    } else {
      mapRef.current.setBounds(bounds)
    }
  }, [activeRecords, mapState.ready])

  const loadAllData = async () => {
    if (!dataKey.trim()) {
      setResults((current) =>
        Object.fromEntries(
          DATASETS.map((dataset) => [
            dataset.id,
            {
              ...current[dataset.id],
              status: dataset.endpoint ? 'error' : 'needs-endpoint',
              error: dataset.endpoint ? '공공데이터포털 API 키가 필요합니다.' : '',
            },
          ]),
        ),
      )
      return
    }

    setIsLoadingData(true)
    setResults((current) =>
      Object.fromEntries(
        DATASETS.map((dataset) => [
          dataset.id,
          {
            ...current[dataset.id],
            status: dataset.endpoint ? 'loading' : 'needs-endpoint',
            error: '',
          },
        ]),
      ),
    )

    const settled = await Promise.allSettled(
      DATASETS.map((dataset) =>
        fetchDataset(dataset, {
          serviceKey: dataKey.trim(),
          accidentYear,
          geocoder: geocoderRef.current,
        }),
      ),
    )

    setResults(
      Object.fromEntries(
        DATASETS.map((dataset, index) => {
          const result = settled[index]
          if (!dataset.endpoint) {
            return [
              dataset.id,
              {
                status: 'needs-endpoint',
                rawCount: 0,
                mappedCount: 0,
                records: [],
                error: '이 데이터셋은 공공데이터포털 Swagger 요청주소 확인 후 DATASETS에 endpoint를 추가해야 합니다.',
              },
            ]
          }

          if (result.status === 'rejected') {
            return [
              dataset.id,
              {
                status: 'error',
                rawCount: 0,
                mappedCount: 0,
                records: [],
                error: result.reason?.message || '데이터를 불러오지 못했습니다.',
              },
            ]
          }

          return [
            dataset.id,
            {
              status: 'loaded',
              rawCount: result.value.rawCount,
              mappedCount: result.value.records.length,
              records: result.value.records,
              error: result.value.notice,
            },
          ]
        }),
      ),
    )
    setIsLoadingData(false)
  }

  useEffect(() => {
    if (!mapState.ready || !dataKey.trim() || autoLoadedRef.current) return
    autoLoadedRef.current = true
    loadAllData()
  }, [mapState.ready, dataKey])

  const toggleDataset = (datasetId) => {
    setEnabled((current) => ({
      ...current,
      [datasetId]: !current[datasetId],
    }))
  }

  return (
    <main className="app-shell">
      <aside className="control-panel">
        <div className="brand-block">
          <span className="eyebrow">S4C Safety Map</span>
          <h1>공공 안전 데이터 지도</h1>
          <p>
            공공데이터포털 10개 API를 카카오맵 위에 색상별 마커로 표시합니다.
          </p>
        </div>

        <section className="panel-section">
          <button
            className="primary-action"
            onClick={loadAllData}
            type="button"
            disabled={!mapState.ready || isLoadingData}
          >
            {isLoadingData ? '데이터 불러오는 중' : '데이터 불러오기'}
          </button>
          {mapState.error ? <p className="message error">{mapState.error}</p> : null}
        </section>

        <section className="metric-strip" aria-label="데이터 요약">
          <div>
            <strong>{totals.loaded.toLocaleString()}</strong>
            <span>표시 지점</span>
          </div>
          <div>
            <strong>{activeRecords.length.toLocaleString()}</strong>
            <span>현재 보기</span>
          </div>
          <div>
            <strong>
              {totals.connected}/{DATASETS.length}
            </strong>
            <span>연결 API</span>
          </div>
        </section>

        <section className="panel-section">
          <h2>분류</h2>
          <div className="segmented-control">
            {groups.map((group) => (
              <button
                key={group}
                className={selectedGroup === group ? 'is-active' : ''}
                type="button"
                onClick={() => setSelectedGroup(group)}
              >
                {group === 'all' ? '전체' : group}
              </button>
            ))}
          </div>
        </section>

        <section className="dataset-list" aria-label="데이터셋 목록">
          {DATASETS.map((dataset) => {
            const result = results[dataset.id]
            const status = dataset.endpoint ? result.status : 'needs-endpoint'
            return (
              <article className="dataset-row" key={dataset.id}>
                <button
                  className={`toggle-dot ${enabled[dataset.id] ? 'is-on' : ''}`}
                  style={{ '--dot-color': dataset.color }}
                  type="button"
                  aria-label={`${dataset.name} 표시 전환`}
                  onClick={() => toggleDataset(dataset.id)}
                />
                <div className="dataset-copy">
                  <div className="dataset-title">
                    <strong>{dataset.name}</strong>
                    <span>{resultLabel(status)}</span>
                  </div>
                  <p>{dataset.description}</p>
                  <div className="dataset-meta">
                    <span>{dataset.id}</span>
                    <span>{dataset.group}</span>
                    <span>
                      {result.mappedCount.toLocaleString()} /{' '}
                      {result.rawCount.toLocaleString()}
                    </span>
                  </div>
                  {result.error ? <p className="message">{result.error}</p> : null}
                </div>
              </article>
            )
          })}
        </section>
      </aside>

      <section className="map-stage" aria-label="카카오맵">
        <div className="map-toolbar">
          <div>
            <strong>대전 중심 지도</strong>
            <span>색상 마커와 반경 표시로 실제 지점 위치를 강조합니다.</span>
          </div>
          <button type="button" onClick={loadKakaoMap}>
            지도 다시 불러오기
          </button>
        </div>
        <div ref={mapContainerRef} className="map-canvas" />
        {!mapState.ready ? (
          <div className="map-placeholder">
            <strong>
              {mapState.loading ? '카카오맵을 불러오는 중' : '지도 준비 필요'}
            </strong>
            <span>.env의 카카오맵 키와 등록 도메인을 확인하세요.</span>
          </div>
        ) : null}
      </section>
    </main>
  )
}

async function fetchDataset(dataset, options) {
  if (!dataset.endpoint) {
    return { rawCount: 0, records: [], notice: '요청주소가 비어 있습니다.' }
  }

  const queries = getDatasetQueries(dataset, options)
  const rawRecords = []
  const requestErrors = []

  for (const query of queries) {
    try {
      const url = buildRequestUrl(dataset, options, query)
      const response = await fetch(url)
      const text = await response.text()

      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`)
      }

      const payload = parsePayload(text)
      const apiError = findApiError(payload)
      if (apiError) throw new Error(apiError)

      rawRecords.push(...collectRecords(payload))
    } catch (error) {
      requestErrors.push(error.message || '요청 실패')
    }
  }

  if (!rawRecords.length && requestErrors.length) {
    throw new Error([...new Set(requestErrors)].join(', '))
  }

  const uniqueRecords = dedupeRecords(rawRecords)
  const records = []
  let geocoded = 0
  let locationLookups = 0

  for (const item of uniqueRecords.slice(0, DEFAULT_ROWS)) {
    const shouldLookup =
      dataset.locationLookup === 'playFacility' &&
      locationLookups < MAX_LOCATION_LOOKUPS
    const normalized = await normalizeRecord(item, dataset, {
      geocoder: options.geocoder,
      serviceKey: options.serviceKey,
      shouldLookup,
    })
    if (shouldLookup) locationLookups += 1
    if (normalized) {
      records.push(normalized)
      if (normalized.geocoded) geocoded += 1
    }
  }

  const skipped = uniqueRecords.length - records.length
  const noticeParts = []
  if (skipped > 0) noticeParts.push(`좌표 없는 ${skipped}건 제외`)
  if (geocoded > 0) noticeParts.push(`주소 변환 ${geocoded}건`)
  if (locationLookups > 0) noticeParts.push(`시설 위치 매칭 ${locationLookups}건`)
  if (requestErrors.length > 0) {
    noticeParts.push(`일부 요청 실패 ${requestErrors.length}건`)
  }

  return {
    rawCount: uniqueRecords.length,
    records,
    notice: noticeParts.join(', '),
  }
}

function getDatasetQueries(dataset, { accidentYear }) {
  const query = typeof dataset.query === 'function' ? dataset.query({ accidentYear }) : null
  if (Array.isArray(query)) return query
  return [query || { type: 'json' }]
}

function buildRequestUrl(dataset, { serviceKey }, query) {
  const url = dataset.endpoint.startsWith('http')
    ? new URL(dataset.endpoint)
    : new URL(dataset.endpoint, window.location.origin)

  url.searchParams.set(dataset.serviceKeyParam || 'serviceKey', serviceKey)
  url.searchParams.set('pageNo', '1')
  url.searchParams.set('numOfRows', String(DEFAULT_ROWS))

  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null) url.searchParams.set(key, value)
  })

  return url.toString()
}

function parsePayload(text) {
  const trimmed = text.trim()
  if (!trimmed) return {}
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return JSON.parse(trimmed)

  const parser = new DOMParser()
  const xml = parser.parseFromString(trimmed, 'application/xml')
  const parserError = xml.querySelector('parsererror')
  if (parserError) throw new Error('응답 XML을 해석하지 못했습니다.')
  return xmlNodeToObject(xml.documentElement)
}

function xmlNodeToObject(node) {
  const children = Array.from(node.children)
  if (!children.length) return node.textContent?.trim() || ''

  return children.reduce((acc, child) => {
    const value = xmlNodeToObject(child)
    if (acc[child.nodeName] === undefined) {
      acc[child.nodeName] = value
    } else if (Array.isArray(acc[child.nodeName])) {
      acc[child.nodeName].push(value)
    } else {
      acc[child.nodeName] = [acc[child.nodeName], value]
    }
    return acc
  }, {})
}

function findApiError(payload) {
  const flat = flattenObject(payload)
  const code = flat.resultCode || flat.returnReasonCode || flat.errMsg
  const message = flat.resultMsg || flat.returnAuthMsg || flat.errMsg

  if (!code) return ''
  if (String(code) === '00' || String(code).toUpperCase() === 'NORMAL SERVICE') {
    return ''
  }
  return message ? `${code}: ${message}` : String(code)
}

function collectRecords(payload) {
  const candidates = []

  const visit = (value, key = '') => {
    if (!value) return
    if (Array.isArray(value)) {
      if (value.some((entry) => entry && typeof entry === 'object')) {
        candidates.push(value.filter((entry) => entry && typeof entry === 'object'))
      }
      value.forEach((entry) => visit(entry, key))
      return
    }

    if (typeof value !== 'object') return

    if (
      ['item', 'items', 'Item', 'row', 'rows', 'data', 'list'].includes(key) &&
      hasRecordShape(value)
    ) {
      candidates.push([value])
    }

    Object.entries(value).forEach(([childKey, childValue]) =>
      visit(childValue, childKey),
    )
  }

  visit(payload)

  const longest = candidates.sort((a, b) => b.length - a.length)[0] || []
  if (longest.length) return dedupeRecords(longest)
  return hasRecordShape(payload) ? [payload] : []
}

async function normalizeRecord(item, dataset, context = {}) {
  const flat = flattenObject(item)
  let lat = parseCoordinate(readAny(flat, LAT_KEYS))
  let lng = parseCoordinate(readAny(flat, LNG_KEYS))
  let address = readAny(flat, ADDRESS_KEYS)
  let lookupDetails = []

  if ((!lat || !lng) && context.shouldLookup && context.serviceKey) {
    const location = await lookupPlayFacilityLocation(
      readAny(flat, ['pfctSn', 'PFCT_SN', '놀이시설번호']),
      context.serviceKey,
    )
    if (location) {
      lat = location.lat
      lng = location.lng
      address = address || location.address
      lookupDetails = location.details
    }
  }

  let geocoded = false
  if ((!lat || !lng) && address && context.geocoder) {
    const point = await geocodeAddress(context.geocoder, address)
    if (point) {
      lat = point.lat
      lng = point.lng
      geocoded = true
    }
  }

  if (!isKoreanCoordinate(lat, lng)) return null
  if (!isDaejeonRecord(flat, lat, lng)) return null

  const title =
    readAny(flat, NAME_KEYS) ||
    address ||
    `${dataset.name} ${Math.abs(lat).toFixed(5)}, ${Math.abs(lng).toFixed(5)}`

  return {
    datasetId: dataset.id,
    datasetName: dataset.name,
    sourceUrl: dataset.sourceUrl,
    group: dataset.group,
    color: dataset.color,
    title: String(title),
    address: address ? String(address) : '',
    lat,
    lng,
    geocoded,
    details: mergeDetails(pickDetails(flat), lookupDetails),
  }
}

async function lookupPlayFacilityLocation(pfctSn, serviceKey) {
  if (!hasValue(pfctSn)) return null
  const cacheKey = String(pfctSn)
  if (playFacilityLocationCache.has(cacheKey)) {
    return playFacilityLocationCache.get(cacheKey)
  }

  const url = new URL('/data-api/1741000/pfc3/getPfctInfo3', window.location.origin)
  url.searchParams.set('serviceKey', serviceKey)
  url.searchParams.set('pageIndex', '1')
  url.searchParams.set('recordCountPerPage', '1')
  url.searchParams.set('pfctSn', cacheKey)

  try {
    const response = await fetch(url)
    const text = await response.text()
    if (!response.ok) throw new Error(response.statusText)

    const payload = parsePayload(text)
    const item = collectRecords(payload)[0]
    if (!item) {
      playFacilityLocationCache.set(cacheKey, null)
      return null
    }

    const flat = flattenObject(item)
    const lat = parseCoordinate(readAny(flat, LAT_KEYS))
    const lng = parseCoordinate(readAny(flat, LNG_KEYS))
    const address = readAny(flat, ADDRESS_KEYS)

    if (!isKoreanCoordinate(lat, lng)) {
      playFacilityLocationCache.set(cacheKey, null)
      return null
    }

    const location = {
      lat,
      lng,
      address: address ? String(address) : '',
      details: pickDetails(flat).map((detail) => ({
        ...detail,
        label: `기본정보 ${detail.label}`,
      })),
    }

    playFacilityLocationCache.set(cacheKey, location)
    return location
  } catch {
    playFacilityLocationCache.set(cacheKey, null)
    return null
  }
}

function geocodeAddress(geocoder, address) {
  return new Promise((resolve) => {
    geocoder.addressSearch(address, (result, status) => {
      if (status !== window.kakao.maps.services.Status.OK || !result[0]) {
        resolve(null)
        return
      }
      resolve({
        lat: Number(result[0].y),
        lng: Number(result[0].x),
      })
    })
  })
}

function flattenObject(value, prefix = '', acc = {}) {
  if (!value || typeof value !== 'object') return acc

  Object.entries(value).forEach(([key, child]) => {
    const nextKey = prefix ? `${prefix}.${key}` : key
    if (child && typeof child === 'object' && !Array.isArray(child)) {
      flattenObject(child, nextKey, acc)
    } else if (!Array.isArray(child)) {
      acc[key] = child
      acc[nextKey] = child
    }
  })

  return acc
}

function readAny(record, keys) {
  for (const key of keys) {
    const exact = record[key]
    if (hasValue(exact)) return exact

    const foundKey = Object.keys(record).find(
      (candidate) => candidate.toLowerCase() === key.toLowerCase(),
    )
    if (foundKey && hasValue(record[foundKey])) return record[foundKey]
  }
  return ''
}

function pickDetails(record) {
  const ignored = new Set([
    ...LAT_KEYS,
    ...LNG_KEYS,
    'geom_json',
    'geometry',
    'response',
    'body',
    'items',
    'item',
  ])

  return Object.entries(record)
    .filter(([key, value]) => {
      if (ignored.has(key)) return false
      if (key.includes('.')) return false
      if (!hasValue(value)) return false
      return String(value).length < 90
    })
    .slice(0, 7)
    .map(([key, value]) => ({
      label: FIELD_LABELS[key] || key,
      value: String(value),
    }))
}

function mergeDetails(primary, secondary) {
  const seen = new Set()
  return [...primary, ...secondary].filter((detail) => {
    const key = `${detail.label}:${detail.value}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).slice(0, 9)
}

function hasRecordShape(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  return Object.values(value).some((entry) => typeof entry !== 'object')
}

function dedupeRecords(records) {
  const seen = new Set()
  return records.filter((record) => {
    const key = JSON.stringify(record)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function hasValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== ''
}

function parseCoordinate(value) {
  if (!hasValue(value)) return null
  const number = Number(String(value).replace(/,/g, '').trim())
  return Number.isFinite(number) ? number : null
}

function isKoreanCoordinate(lat, lng) {
  return lat >= 33 && lat <= 39.5 && lng >= 124 && lng <= 132
}

function isDaejeonRecord(record, lat, lng) {
  const regionText = [
    record.rgnNm,
    record.rgnCdNm,
    record.RDNMADR,
    record.LNMADR,
    record.rdnmadr,
    record.lnmadr,
    record.ronaAddr,
    record.lotnoAddr,
    record.address,
    record.addr,
    record.adres,
  ]
    .filter(hasValue)
    .join(' ')

  if (regionText.includes(DAEJEON_REGION_NAME) || regionText.includes('대전')) {
    return true
  }

  return lat >= 36.0 && lat <= 36.7 && lng >= 126.95 && lng <= 127.75
}

function getRecordRadius(record) {
  if (record.datasetId === '15058311') return 300
  if (record.datasetId === '15058925') return 200
  if (record.group === '도로시설') return 45
  if (record.group === '어린이놀이시설') return 70
  return 90
}

function createMarkerImage(color) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="42" height="50" viewBox="0 0 42 50">
      <filter id="shadow" x="-30%" y="-20%" width="160%" height="160%">
        <feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#111827" flood-opacity="0.35"/>
      </filter>
      <path filter="url(#shadow)" fill="${color}" stroke="white" stroke-width="4" d="M21 48c5.7-8.7 16-18 16-31A16 16 0 1 0 5 17c0 13 10.3 22.3 16 31Z"/>
      <circle cx="21" cy="17" r="6.5" fill="white"/>
    </svg>`

  return new window.kakao.maps.MarkerImage(
    `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    new window.kakao.maps.Size(42, 50),
    { offset: new window.kakao.maps.Point(21, 49) },
  )
}

function renderHoverContent(record) {
  const details = record.details
    .map(
      (detail) =>
        `<div><span>${escapeHtml(detail.label)}</span><strong>${escapeHtml(
          detail.value,
        )}</strong></div>`,
    )
    .join('')

  return `
    <div class="hover-card">
      <div class="hover-card__head" style="border-color:${record.color}">
        <span>${escapeHtml(record.datasetName)}</span>
        <strong>${escapeHtml(record.title)}</strong>
      </div>
      ${
        record.address
          ? `<p class="hover-card__address">${escapeHtml(record.address)}</p>`
          : ''
      }
      <div class="hover-card__details">${details}</div>
      <p class="hover-card__source">출처: ${escapeHtml(record.sourceUrl)}</p>
    </div>
  `
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function resultLabel(status) {
  const labels = {
    idle: '대기',
    loading: '조회중',
    loaded: '완료',
    error: '오류',
    'needs-endpoint': 'API 미연결',
  }
  return labels[status] || status
}

export default App
