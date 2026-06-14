import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import crimeTimeCsv from './assets/dje_time_crime.csv?raw'

const DAEJEON_CENTER = { lat: 36.3504, lng: 127.3845 }
const DEFAULT_SEARCH_PLACE = {
  name: '대전광역시청',
  address: '대전광역시 서구 둔산로 100',
  lat: DAEJEON_CENTER.lat,
  lng: DAEJEON_CENTER.lng,
}
const DEFAULT_ROWS = 500
const ACCIDENT_YEAR_LOOKBACK = 5
const ACCIDENT_ZONE_RADIUS_METERS = 186
const MAX_PAGES_PER_DATASET = 300
const LOCATION_LOOKUP_CONCURRENCY = 8
const NORMALIZE_CONCURRENCY = 8
const DATA_CACHE_DB_NAME = 's4c-data-cache'
const DATA_CACHE_DB_VERSION = 1
const DATA_CACHE_STORE_NAME = 'datasets'
const DATA_CACHE_VERSION = '2026-06-14-v2'
const DATA_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7
const LATEST_ACCIDENT_YEAR = String(new Date().getFullYear() - 1)
const DAEJEON_REGION_NAME = '대전광역시'
const DAEJEON_REGION_CODE = '30'
const DAEJEON_GU_GUN_CODES = ['110', '140', '170', '200', '230']
const DAEJEON_COORDINATE_BOUNDS = {
  south: 36.15,
  west: 127.2,
  north: 36.52,
  east: 127.56,
}
const ACTIVITY_EXCELLENT_DATASET_ID = '15124527'
const PLAY_FACILITY_DATASET_ID = '15124519'
const TRAFFIC_SIGNAL_DATASET_ID = '15110706'
const CHILD_PROTECTION_ZONE_DATASET_ID = '15007288'
const CHILD_PROTECTION_ZONE_DEFAULT_RADIUS_METERS = 300
const HALF_HOUR_MINUTES = 30
const DAY_MINUTES = 24 * 60
const ACTIVITY_RISK_DIM_MIN_OPACITY = 0.018
const ACTIVITY_RISK_DIM_MAX_OPACITY = 0.22
const DAY_LIGHT_VISIBILITY = 0.1
const CRIME_TIME_RANGES = [
  { key: 'lateNight', label: '심야', startMinutes: 0, endMinutes: 4 * 60 },
  { key: 'dawn', label: '새벽', startMinutes: 4 * 60, endMinutes: 7 * 60 },
  { key: 'morning', label: '오전', startMinutes: 7 * 60, endMinutes: 12 * 60 },
  { key: 'afternoon', label: '오후', startMinutes: 12 * 60, endMinutes: 18 * 60 },
  { key: 'earlyEvening', label: '초저녁', startMinutes: 18 * 60, endMinutes: 20 * 60 },
  { key: 'night', label: '밤', startMinutes: 20 * 60, endMinutes: 24 * 60 },
]
const ACTIVITY_CRIME_RISK_SLOTS = createActivityCrimeRiskSlots(crimeTimeCsv)
const ACTIVITY_DATASET_IDS = [
  '15007270',
  ACTIVITY_EXCELLENT_DATASET_ID,
  '15124524',
  '15124521',
  PLAY_FACILITY_DATASET_ID,
]
const CATEGORY_OPTIONS = [
  {
    id: 'safety',
    label: '아동 안전',
    datasetIds: [
      '15058311',
      '15058925',
      '15110685',
      '15110706',
      CHILD_PROTECTION_ZONE_DATASET_ID,
    ],
  },
  {
    id: 'activity',
    label: '아동 활동',
    datasetIds: ACTIVITY_DATASET_IDS,
  },
]
const CLUSTER_STEPS = [10, 50, 100]
const CLUSTER_STYLES = [
  {
    width: '42px',
    height: '42px',
    borderRadius: '50%',
    background: 'rgba(47, 95, 232, 0.88)',
    border: '3px solid rgba(255, 255, 255, 0.92)',
    color: '#ffffff',
    textAlign: 'center',
    lineHeight: '36px',
    fontWeight: '800',
    boxShadow: '0 10px 24px rgba(22, 43, 88, 0.28)',
  },
  {
    width: '50px',
    height: '50px',
    borderRadius: '50%',
    background: 'rgba(35, 150, 90, 0.9)',
    border: '3px solid rgba(255, 255, 255, 0.92)',
    color: '#ffffff',
    textAlign: 'center',
    lineHeight: '44px',
    fontWeight: '800',
    boxShadow: '0 12px 28px rgba(20, 84, 56, 0.3)',
  },
  {
    width: '58px',
    height: '58px',
    borderRadius: '50%',
    background: 'rgba(238, 126, 31, 0.92)',
    border: '3px solid rgba(255, 255, 255, 0.94)',
    color: '#ffffff',
    textAlign: 'center',
    lineHeight: '52px',
    fontWeight: '800',
    boxShadow: '0 14px 32px rgba(117, 59, 18, 0.32)',
  },
  {
    width: '66px',
    height: '66px',
    borderRadius: '50%',
    background: 'rgba(210, 67, 67, 0.94)',
    border: '3px solid rgba(255, 255, 255, 0.94)',
    color: '#ffffff',
    textAlign: 'center',
    lineHeight: '60px',
    fontWeight: '800',
    boxShadow: '0 16px 36px rgba(111, 30, 30, 0.34)',
  },
]
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
    useLatestAvailableAccidentYear: true,
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
    useLatestAvailableAccidentYear: true,
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
    id: CHILD_PROTECTION_ZONE_DATASET_ID,
    name: '대전 어린이보호구역',
    group: '보호구역',
    color: '#16a34a',
    sourceUrl: 'https://www.data.go.kr/data/15007288/openapi.do',
    endpoint: '/data-api/6300000/kidSafeDaejeonService/kidSafeDaejeonList',
    description: '시설명, 시설종류, 도로명주소, 관할경찰서, CCTV 설치 여부',
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
      rgnCd: DAEJEON_REGION_CODE,
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
      rgnCd: DAEJEON_REGION_CODE,
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
      rgnCd: DAEJEON_REGION_CODE,
      rgnNm: DAEJEON_REGION_NAME,
    }),
  },
  {
    id: PLAY_FACILITY_DATASET_ID,
    name: '어린이놀이시설',
    group: '어린이놀이시설',
    color: '#00a2c7',
    sourceUrl: 'https://www.data.go.kr/data/15124519/openapi.do',
    endpoint: '/data-api/1741000/pfc3/getPfctInfo3',
    description: '놀이시설명, 주소 등 기본 위치 정보',
    query: () => ({
      pageIndex: '1',
      recordCountPerPage: String(DEFAULT_ROWS),
      rgnCd: DAEJEON_REGION_CODE,
      rgnNm: DAEJEON_REGION_NAME,
    }),
  },
  {
    id: TRAFFIC_SIGNAL_DATASET_ID,
    name: '대전 신호등',
    group: '도로시설',
    color: '#ffffff',
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
  LMP_LC_NM: '보안등 위치',
  INSTALLATION_CO: '설치개수',
  INSTALLATION_TYPE: '설치유형',
  REFERENCEDATE: '기준일',
  RDNMADR: '도로명주소',
  LNMADR: '지번주소',
  LATITUDE: '위도',
  LONGITUDE: '경도',
  CTPRVNNM: '시도',
  SIGNGU_NM: '시군구',
  ROADNM: '도로명',
  ROADKND: '도로종류',
  ROAD_ROUTE_NO: '노선번호',
  ROAD_ROUTE_NM: '노선명',
  ROADROUTEDRC: '도로방향',
  HIGHLANDYN: '고원식 여부',
  CARTRKCO: '차로수',
  SGNLLKNND: '신호등 종류',
  managementNumber: '관리번호',
  ntatcSeq: '보호구역 일련번호',
  regDtTm: '등록일',
  manageCop: '관할경찰서',
  cctv: 'CCTV 설치 여부',
  zipcode: '우편번호',
  pfctSn: '시설번호',
  pfctNm: '시설명',
  zip: '우편번호',
  lotnoAddr: '지번주소',
  lotnoDaddr: '지번상세주소',
  ronaAddr: '도로명주소',
  ronaDaddr: '도로명상세주소',
  instlYmd: '설치일',
  clsgYmd: '폐쇄일',
  acptnYmd: '인수일',
  fcar: '면적',
  etcSufa: '기타 안전시설',
  rmk: '비고',
  exfcSn: '우수시설번호',
  dsgnYmd: '지정일',
  fctyCd: '시설유형코드',
  rgnCd: '지역코드',
  instlPlaceCd: '설치장소코드',
  instlPlaceCdNm: '설치장소',
  dutyCd: '의무구분코드',
  dutyCdNm: '의무구분',
  prvtPblcYnCd: '민간/공공 코드',
  prvtPblcYnCdNm: '민간/공공',
  operYnCd: '운영코드',
  operYnCdNm: '운영여부',
  idrodrCd: '실내외 코드',
  idrodrCdNm: '실내외',
  exfcYn: '우수시설 여부',
  exfcDsgnYmd: '우수시설 지정일',
  rgnCdNm: '지역',
  wowaStylRideCd: '물놀이형 기구 코드',
  wowaStylRideCdNm: '물놀이형 기구',
  rideSn: '기구번호',
  rideNm: '기구명',
  rideNo: '기구번호',
  rideLctn: '기구위치',
  rideInstlYmd: '기구 설치일',
  instlFrmNm: '설치형태',
  inspSn: '검사번호',
  inspKndCd: '검사종류코드',
  inspKndCdNm: '검사종류',
  inspYmd: '검사일',
  inspRsltCd: '검사결과코드',
  inspRsltCdNm: '검사결과',
  occrrnc_cnt: '사고건수',
  caslt_cnt: '사상자수',
  dth_dnv_cnt: '사망자수',
  se_dnv_cnt: '중상자수',
  sl_dnv_cnt: '경상자수',
  wnd_dnv_cnt: '부상신고자수',
  sido_sgg_nm: '지역',
  spot_nm: '사고지점',
  afos_id: '사고권역ID',
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
const RADIUS_KEYS = [
  'radius',
  'radiusMeter',
  'radiusMeters',
  'range',
  'rangeMeter',
  'rangeMeters',
  'protectionRadius',
  'protectionRadiusMeter',
  'zoneRadius',
  'safeZoneRadius',
  'rds',
  '반경',
  '보호구역반경',
  '보호구역범위',
]

function App() {
  const mapContainerRef = useRef(null)
  const mapDimCanvasRef = useRef(null)
  const childZoneGlowCanvasRef = useRef(null)
  const securityLightCanvasRef = useRef(null)
  const mapRef = useRef(null)
  const geocoderRef = useRef(null)
  const clustererRef = useRef(null)
  const markerRefs = useRef([])
  const rangeRefs = useRef([])
  const infoWindowRef = useRef(null)
  const searchMarkerRef = useRef(null)
  const autoLoadedRef = useRef(false)
  const fittedDisplayRecordsRef = useRef(null)

  const kakaoKey = env.VITE_KAKAO_MAP_APP_KEY || ''
  const dataKey = env.VITE_DATA_GO_KR_SERVICE_KEY || ''
  const accidentYear = LATEST_ACCIDENT_YEAR
  const [mapState, setMapState] = useState({
    ready: false,
    loading: false,
    error: '',
  })
  const [mapLevel, setMapLevel] = useState(7)
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
  const [selectedDatasetLayers, setSelectedDatasetLayers] = useState(() =>
    Object.fromEntries(DATASETS.map((dataset) => [dataset.id, true])),
  )
  const [selectedRecord, setSelectedRecord] = useState(null)
  const [hoveredRecord, setHoveredRecord] = useState(null)
  const [searchText, setSearchText] = useState('대전시청')
  const [searchTarget, setSearchTarget] = useState('')
  const [searchVersion, setSearchVersion] = useState(0)
  const [searchLocation, setSearchLocation] = useState(DEFAULT_SEARCH_PLACE)
  const [hasSearched, setHasSearched] = useState(true)
  const [searchState, setSearchState] = useState({
    loading: false,
    error: '',
  })
  const [isLoadingData, setIsLoadingData] = useState(false)
  const [currentCrimeRisk, setCurrentCrimeRisk] = useState(() => getCurrentCrimeRisk())
  const [nightLightLevel, setNightLightLevel] = useState(() => getNightLightLevel())

  const activeRecords = useMemo(() => {
    const datasetIds = new Set()

    CATEGORY_OPTIONS.forEach((category) => {
      category.datasetIds.forEach((datasetId) => {
        if (selectedDatasetLayers[datasetId]) datasetIds.add(datasetId)
      })
    })

    return DATASETS.flatMap((dataset) => {
      if (!datasetIds.has(dataset.id)) return []
      return (results[dataset.id]?.records || []).filter(isDisplayableDaejeonRecord)
    })
  }, [results, selectedDatasetLayers])

  const displayRecords = useMemo(
    () =>
      annotateChildProtectionZoneOutlines(
        mergeOverlappingTrafficSignals(dedupeActivityDisplayRecords(activeRecords)),
      ),
    [activeRecords],
  )
  const securityLightRecords = useMemo(
    () => displayRecords.filter(isSecurityLightRecord),
    [displayRecords],
  )
  const childProtectionZoneRecords = useMemo(
    () => displayRecords.filter(isChildProtectionZoneRecord),
    [displayRecords],
  )

  const mapDatasetLayerGroups = useMemo(() => {
    return CATEGORY_OPTIONS.map((category) => {
      const datasetIdSet = new Set(category.datasetIds)
      const datasets = DATASETS.filter((dataset) => datasetIdSet.has(dataset.id)).map(
        (dataset) => ({
          ...dataset,
          count: results[dataset.id]?.mappedCount || 0,
          selected: selectedDatasetLayers[dataset.id] !== false,
        }),
      )

      return {
        id: category.id,
        label: category.label,
        datasets,
        selected: datasets.length > 0 && datasets.every((dataset) => dataset.selected),
      }
    })
  }, [results, selectedDatasetLayers])

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
        setMapLevel(map.getLevel())
        geocoderRef.current = new window.kakao.maps.services.Geocoder()
        mapDimCanvasRef.current = ensureMapCanvas(
          mapContainerRef.current,
          'map-dim-canvas',
        )
        childZoneGlowCanvasRef.current = ensureMapCanvas(
          mapContainerRef.current,
          'child-zone-glow-canvas',
        )
        securityLightCanvasRef.current = ensureSecurityLightCanvas(mapContainerRef.current)
        infoWindowRef.current = new window.kakao.maps.InfoWindow({
          removable: false,
          zIndex: 10000,
        })

        clustererRef.current = null

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
    if (!hasSearched || !mapContainerRef.current) return
    loadKakaoMap()
  }, [hasSearched, loadKakaoMap])

  useEffect(() => {
    if (!mapState.ready || !mapRef.current) return

    const map = mapRef.current
    const updateMapLevel = () => setMapLevel(map.getLevel())

    updateMapLevel()
    window.kakao.maps.event.addListener(map, 'zoom_changed', updateMapLevel)

    return () => {
      window.kakao.maps.event.removeListener(map, 'zoom_changed', updateMapLevel)
    }
  }, [mapState.ready])

  useEffect(() => {
    const updateTimeBasedVisuals = () => {
      setCurrentCrimeRisk((current) => {
        const next = getCurrentCrimeRisk()
        return current.slotIndex === next.slotIndex ? current : next
      })
      setNightLightLevel((current) => {
        const next = getNightLightLevel()
        return Math.abs(current - next) < 0.01 ? current : next
      })
    }

    updateTimeBasedVisuals()
    const timerId = window.setInterval(updateTimeBasedVisuals, 60 * 1000)

    return () => window.clearInterval(timerId)
  }, [])

  useEffect(() => {
    if (!mapState.ready || !mapRef.current) return

    mapDimCanvasRef.current =
      mapDimCanvasRef.current || ensureMapCanvas(mapContainerRef.current, 'map-dim-canvas')

    if (!mapDimCanvasRef.current) return

    const canvas = mapDimCanvasRef.current
    const draw = () => {
      drawMapDimCanvas(canvas, getGlobalMapDimOpacity(currentCrimeRisk.opacity))
    }

    draw()
    window.addEventListener('resize', draw)

    return () => {
      window.removeEventListener('resize', draw)
    }
  }, [currentCrimeRisk.opacity, mapState.ready])

  useEffect(() => {
    if (!mapState.ready || !mapRef.current) return

    markerRefs.current.forEach((marker) => marker.setMap(null))
    markerRefs.current = []
    rangeRefs.current.forEach((overlay) => overlay.setMap(null))
    rangeRefs.current = []
    clustererRef.current?.clear()
    infoWindowRef.current?.close()
    setHoveredRecord(null)

    if (!displayRecords.length) return

    const bounds = new window.kakao.maps.LatLngBounds()
    const markers = displayRecords.flatMap((record) => {
      const position = new window.kakao.maps.LatLng(record.lat, record.lng)
      const rangeOverlays = createRangeOverlays(
        record,
        position,
        mapRef.current,
        nightLightLevel,
        currentCrimeRisk.intensity,
      )
      const showRangeInfo = () => {
        rangeOverlays.forEach((overlay) =>
          overlay.setOptions(
            getOverlayStyle(
              record,
              overlay,
              'hover',
              nightLightLevel,
              currentCrimeRisk.intensity,
            ),
          ),
        )
        setHoveredRecord(createMapHoverCardState(record, position, mapRef.current))
      }
      const hideRangeInfo = () => {
        rangeOverlays.forEach((overlay) =>
          overlay.setOptions(
            getOverlayStyle(
              record,
              overlay,
              'normal',
              nightLightLevel,
              currentCrimeRisk.intensity,
            ),
          ),
        )
        infoWindowRef.current?.close()
        setHoveredRecord(null)
      }

      rangeOverlays.forEach((overlay) => {
        window.kakao.maps.event.addListener(overlay, 'mouseover', showRangeInfo)
        window.kakao.maps.event.addListener(overlay, 'mouseout', hideRangeInfo)
      })

      extendBoundsForRecord(bounds, record)
      rangeRefs.current.push(...rangeOverlays)

      if (isMarkerlessRecord(record)) {
        return []
      }

      if (isActivityRecord(record) && !isActivityStickerVisible(mapLevel)) {
        return []
      }

      const marker = new window.kakao.maps.Marker({
        position,
        title: record.title,
        image: isActivityRecord(record)
          ? createActivityStickerMarkerImage(record, mapLevel)
          : createMarkerImage(record.color),
      })

      window.kakao.maps.event.addListener(marker, 'mouseover', () => {
        rangeOverlays.forEach((overlay) =>
          overlay.setOptions(
            getOverlayStyle(
              record,
              overlay,
              'hover',
              nightLightLevel,
              currentCrimeRisk.intensity,
            ),
          ),
        )
        setHoveredRecord(createMapHoverCardState(record, position, mapRef.current))
      })
      window.kakao.maps.event.addListener(marker, 'mouseout', hideRangeInfo)

      return [marker]
    })

    markerRefs.current = markers

    markers.forEach((marker) => marker.setMap(mapRef.current))

    if (searchLocation) return
    if (fittedDisplayRecordsRef.current === displayRecords) return

    fittedDisplayRecordsRef.current = displayRecords

    if (displayRecords.length === 1) {
      const [record] = displayRecords
      mapRef.current.setCenter(new window.kakao.maps.LatLng(record.lat, record.lng))
      mapRef.current.setLevel(4)
    } else {
      mapRef.current.setBounds(bounds)
    }
  }, [
    currentCrimeRisk.intensity,
    displayRecords,
    mapLevel,
    mapState.ready,
    nightLightLevel,
    searchLocation,
  ])

  useEffect(() => {
    if (!mapState.ready || !mapRef.current) return

    childZoneGlowCanvasRef.current =
      childZoneGlowCanvasRef.current ||
      ensureMapCanvas(mapContainerRef.current, 'child-zone-glow-canvas')

    if (!childZoneGlowCanvasRef.current) return

    const map = mapRef.current
    const canvas = childZoneGlowCanvasRef.current
    let frameId = 0
    const draw = () => {
      window.cancelAnimationFrame(frameId)
      frameId = window.requestAnimationFrame(() => {
        drawChildProtectionGlowCanvas(
          canvas,
          map,
          childProtectionZoneRecords,
          currentCrimeRisk.intensity,
        )
      })
    }

    draw()

    window.kakao.maps.event.addListener(map, 'center_changed', draw)
    window.kakao.maps.event.addListener(map, 'zoom_changed', draw)
    window.addEventListener('resize', draw)

    return () => {
      window.cancelAnimationFrame(frameId)
      window.kakao.maps.event.removeListener(map, 'center_changed', draw)
      window.kakao.maps.event.removeListener(map, 'zoom_changed', draw)
      window.removeEventListener('resize', draw)
    }
  }, [childProtectionZoneRecords, currentCrimeRisk.intensity, mapState.ready])

  useEffect(() => {
    if (!mapState.ready || !mapRef.current) return

    securityLightCanvasRef.current =
      securityLightCanvasRef.current || ensureSecurityLightCanvas(mapContainerRef.current)

    if (!securityLightCanvasRef.current) return

    const map = mapRef.current
    const canvas = securityLightCanvasRef.current
    let frameId = 0
    const draw = () => {
      window.cancelAnimationFrame(frameId)
      frameId = window.requestAnimationFrame(() => {
        drawSecurityLightCanvas(canvas, map, securityLightRecords, nightLightLevel)
      })
    }

    draw()

    window.kakao.maps.event.addListener(map, 'center_changed', draw)
    window.kakao.maps.event.addListener(map, 'zoom_changed', draw)
    window.addEventListener('resize', draw)

    return () => {
      window.cancelAnimationFrame(frameId)
      window.kakao.maps.event.removeListener(map, 'center_changed', draw)
      window.kakao.maps.event.removeListener(map, 'zoom_changed', draw)
      window.removeEventListener('resize', draw)
    }
  }, [mapState.ready, nightLightLevel, securityLightRecords])

  useEffect(() => {
    if (!hasSearched || !searchTarget || !mapState.ready || !mapRef.current) return

    let cancelled = false
    setSearchState({ loading: true, error: '' })

    searchKakaoPlace(searchTarget)
      .then((place) => {
        if (cancelled) return

        const position = new window.kakao.maps.LatLng(place.lat, place.lng)
        mapRef.current.setCenter(position)
        mapRef.current.setLevel(4)

        searchMarkerRef.current?.setMap(null)
        searchMarkerRef.current = new window.kakao.maps.Marker({
          map: mapRef.current,
          position,
          title: place.name,
        })

        setSearchLocation(place)
        setSearchState({ loading: false, error: '' })
      })
      .catch((error) => {
        if (cancelled) return
        setSearchLocation(null)
        setSearchState({
          loading: false,
          error: error.message || '장소를 찾지 못했습니다.',
        })
      })

    return () => {
      cancelled = true
    }
  }, [hasSearched, searchTarget, searchVersion, mapState.ready])

  const loadAllData = useCallback(async () => {
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

    const loadOptions = {
      serviceKey: dataKey.trim(),
      accidentYear,
      geocoder: geocoderRef.current,
    }
    const loadDataset = async (dataset) => {
      const cached = await readCachedDataset(dataset, loadOptions)
      if (cached) {
        hydratePlayFacilityLocationCache(dataset, cached.records)
        setResults((current) => ({
          ...current,
          [dataset.id]: getDatasetResultState(dataset, {
            status: 'fulfilled',
            value: cached,
          }),
        }))
        return
      }

      const [result] = await Promise.allSettled([fetchDataset(dataset, loadOptions)])
      if (result.status === 'fulfilled') {
        await writeCachedDataset(dataset, loadOptions, result.value)
      }
      setResults((current) => ({
        ...current,
        [dataset.id]: getDatasetResultState(dataset, result),
      }))
    }
    const playFacilityDataset = DATASETS.find(
      (dataset) => dataset.id === PLAY_FACILITY_DATASET_ID,
    )
    const dependentDatasets = DATASETS.filter(
      (dataset) => dataset.locationLookup === 'playFacility',
    )
    const independentDatasets = DATASETS.filter(
      (dataset) =>
        dataset.id !== PLAY_FACILITY_DATASET_ID &&
        dataset.locationLookup !== 'playFacility',
    )
    const baseLoad = playFacilityDataset
      ? loadDataset(playFacilityDataset)
      : Promise.resolve()
    const independentLoad = Promise.all(independentDatasets.map(loadDataset))

    await baseLoad
    await Promise.all(dependentDatasets.map(loadDataset))
    await independentLoad

    setIsLoadingData(false)
  }, [accidentYear, dataKey])

  useEffect(() => {
    if (!mapState.ready || !dataKey.trim() || autoLoadedRef.current) return
    autoLoadedRef.current = true
    loadAllData()
  }, [mapState.ready, dataKey, loadAllData])

  const handleSearchSubmit = (event) => {
    event.preventDefault()

    const query = searchText.trim()
    if (!query) {
      setSearchState({ loading: false, error: '장소 이름을 입력하세요.' })
      return
    }

    setHasSearched(true)
    setSearchTarget(query)
    setSearchVersion((version) => version + 1)
    setSearchLocation(null)
    setSelectedRecord(null)
    setSearchState({ loading: true, error: '' })
  }

  const toggleDatasetLayer = (datasetId) => {
    setSelectedDatasetLayers((current) => ({
      ...current,
      [datasetId]: !current[datasetId],
    }))
    setSelectedRecord(null)
  }

  const toggleDatasetGroup = (group) => {
    setSelectedDatasetLayers((current) => {
      const next = { ...current }
      const nextVisible = !group.selected

      group.datasets.forEach((dataset) => {
        next[dataset.id] = nextVisible
      })

      return next
    })
    setSelectedRecord(null)
  }

  return (
    <main className={`app-shell ${hasSearched ? 'has-map' : 'is-search-only'}`}>
      <aside className="control-panel">
        <form className="search-panel" onSubmit={handleSearchSubmit}>
          <div className="brand-block">
            <span className="eyebrow">S4C Safety Map</span>
            <h1>아동 안전 지도</h1>
            <p>장소를 검색하면 주변 안전·활동 정보를 지도에서 확인할 수 있습니다.</p>
          </div>
          <div className="search-row">
            <input
              aria-label="장소 검색"
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="예: 대전시청, 둔산동, 한밭수목원"
              type="search"
              value={searchText}
            />
            <button className="primary-action" type="submit">
              검색
            </button>
          </div>
          {searchState.loading ? <p className="message">장소를 찾는 중입니다.</p> : null}
          {searchState.error ? (
            <p className="message error">{searchState.error}</p>
          ) : null}
          {mapState.error ? <p className="message error">{mapState.error}</p> : null}
        </form>

        {hasSearched ? (
          <>
            <section className="selected-panel" aria-label="선택한 정보">
              {selectedRecord ? (
                <article className="selected-card">
                  <span
                    className="selected-card__tag"
                    style={{ '--tag-color': selectedRecord.color }}
                  >
                    {selectedRecord.datasetName}
                  </span>
                  <h2>{selectedRecord.title}</h2>
                  {selectedRecord.address ? <p>{selectedRecord.address}</p> : null}
                  <div className="detail-list">
                    {selectedRecord.details.map((detail) => (
                      <div key={`${detail.label}:${detail.value}`}>
                        <span>{detail.label}</span>
                        <strong>{detail.value}</strong>
                      </div>
                    ))}
                  </div>
                </article>
              ) : (
                <div className="empty-selection">
                  <strong>
                    {searchLocation?.name || searchTarget || '검색 위치'}
                  </strong>
                  <span>
                    지도 위 필터에서 보고 싶은 안전·활동 자료를 선택하세요.
                  </span>
                </div>
              )}
            </section>

            {isLoadingData ? <p className="message">공공데이터를 불러오는 중입니다.</p> : null}
          </>
        ) : null}
      </aside>

      {hasSearched ? (
        <section className="map-stage" aria-label="카카오맵">
          <div ref={mapContainerRef} className="map-canvas" />
          {hoveredRecord ? <MapHoverCard hover={hoveredRecord} /> : null}
          {mapDatasetLayerGroups.length ? (
            <div className="map-layer-control" aria-label="지도 데이터 레이어">
              {mapDatasetLayerGroups.map((group) => (
                <div className="map-layer-control__group" key={group.id}>
                  <div className="map-layer-control__actions">
                    <button
                      aria-pressed={group.selected}
                      className={group.selected ? 'is-active' : ''}
                      onClick={() => toggleDatasetGroup(group)}
                      type="button"
                      title={
                        group.selected
                          ? `${group.label} 전체 해제`
                          : `${group.label} 전체 보기`
                      }
                    >
                      {group.label}
                    </button>
                  </div>
                  <div className="map-layer-control__chips">
                    {group.datasets.map((dataset) => (
                      <button
                        aria-pressed={dataset.selected}
                        className={dataset.selected ? 'is-active' : ''}
                        key={dataset.id}
                        onClick={() => toggleDatasetLayer(dataset.id)}
                        style={{ '--layer-color': dataset.color }}
                        type="button"
                      >
                        <span className="layer-dot" />
                        <strong>{getCompactDatasetName(dataset.name)}</strong>
                        <span>{dataset.count.toLocaleString()}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
          {!mapState.ready ? (
            <div className="map-placeholder">
              <strong>
                {mapState.loading ? '카카오맵을 불러오는 중' : '지도 준비 필요'}
              </strong>
              <span>.env의 카카오맵 키와 등록 도메인을 확인하세요.</span>
            </div>
          ) : null}
        </section>
      ) : null}
    </main>
  )
}

function MapHoverCard({ hover }) {
  const record = hover.record

  return (
    <article
      className="map-hover-card hover-card"
      style={{
        left: `${hover.x}px`,
        top: `${hover.y}px`,
        '--tag-color': record.color,
      }}
    >
      <div className="hover-card__head" style={{ borderLeftColor: record.color }}>
        <span>{record.datasetName}</span>
        <strong>{record.title}</strong>
      </div>
      {record.address ? <p className="hover-card__address">{record.address}</p> : null}
      {record.details?.length ? (
        <div className="hover-card__details">
          {record.details.slice(0, 5).map((detail) => (
            <div key={`${detail.label}:${detail.value}`}>
              <span>{detail.label}</span>
              <strong>{detail.value}</strong>
            </div>
          ))}
        </div>
      ) : null}
      {record.sourceUrl ? <p className="hover-card__source">{record.sourceUrl}</p> : null}
    </article>
  )
}

function getDatasetResultState(dataset, result) {
  if (!dataset.endpoint) {
    return {
      status: 'needs-endpoint',
      rawCount: 0,
      mappedCount: 0,
      records: [],
      error: '공공데이터포털 API 요청주소 확인 후 endpoint를 추가해야 합니다.',
    }
  }

  if (result.status === 'rejected') {
    return {
      status: 'error',
      rawCount: 0,
      mappedCount: 0,
      records: [],
      error: result.reason?.message || '데이터를 불러오지 못했습니다.',
    }
  }

  return {
    status: 'loaded',
    rawCount: result.value.rawCount,
    mappedCount: result.value.records.length,
    records: result.value.records,
    error: result.value.notice,
  }
}

function getDatasetCacheKey(dataset, options) {
  return [
    DATA_CACHE_VERSION,
    dataset.id,
    options.accidentYear || '',
  ].join(':')
}

async function readCachedDataset(dataset, options) {
  if (!dataset.endpoint) return null

  try {
    const db = await openDataCacheDb()
    const entry = await runDataCacheRequest(
      db
        .transaction(DATA_CACHE_STORE_NAME, 'readonly')
        .objectStore(DATA_CACHE_STORE_NAME)
        .get(getDatasetCacheKey(dataset, options)),
    )

    if (!entry || Date.now() - entry.cachedAt > DATA_CACHE_TTL_MS) return null
    return entry.value
  } catch {
    return null
  }
}

async function writeCachedDataset(dataset, options, value) {
  if (!dataset.endpoint) return

  try {
    const db = await openDataCacheDb()
    await runDataCacheRequest(
      db
        .transaction(DATA_CACHE_STORE_NAME, 'readwrite')
        .objectStore(DATA_CACHE_STORE_NAME)
        .put({
          id: getDatasetCacheKey(dataset, options),
          cachedAt: Date.now(),
          value,
        }),
    )
  } catch {
    // Cache writes are a performance optimization; API results remain authoritative.
  }
}

function openDataCacheDb() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error('IndexedDB unavailable'))
      return
    }

    const request = window.indexedDB.open(DATA_CACHE_DB_NAME, DATA_CACHE_DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(DATA_CACHE_STORE_NAME)) {
        db.createObjectStore(DATA_CACHE_STORE_NAME, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function runDataCacheRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function getCompactDatasetName(name) {
  return String(name || '')
    .replace(/^대전\s*/, '')
    .replace(/^전국\s*/, '')
    .replace(/어린이/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function createActivityCrimeRiskSlots(csvText) {
  const valuesByRange = readActivityCrimeTimeValues(csvText)

  if (!valuesByRange.length) return createFallbackCrimeRiskSlots()

  const sourceValues = valuesByRange.map((range) => range.value)
  const minValue = Math.min(...sourceValues)
  const maxValue = Math.max(...sourceValues)
  const anchors = valuesByRange
    .map((range) => ({
      minutes: getCrimeRangeCenterMinutes(range),
      value: range.value,
    }))
    .sort((left, right) => left.minutes - right.minutes)

  return Array.from({ length: DAY_MINUTES / HALF_HOUR_MINUTES }, (_, slotIndex) => {
    const startMinutes = slotIndex * HALF_HOUR_MINUTES
    const endMinutes = startMinutes + HALF_HOUR_MINUTES
    const midpointMinutes = startMinutes + HALF_HOUR_MINUTES / 2
    const value = interpolateCircularCrimeValue(midpointMinutes, anchors)
    const intensity = maxValue === minValue ? 0.5 : (value - minValue) / (maxValue - minValue)
    const opacity = mapCrimeIntensityToOpacity(intensity)

    return {
      slotIndex,
      startMinutes,
      endMinutes,
      value,
      intensity,
      opacity,
    }
  })
}

function readActivityCrimeTimeValues(csvText) {
  const rows = parseSimpleCsvRows(csvText)
  if (rows.length < 2) return []

  const [headers, row] = rows

  return CRIME_TIME_RANGES.flatMap((range) => {
    const headerIndex = headers.findIndex((header) =>
      normalizeCrimeHeader(header).includes(normalizeCrimeHeader(range.label)),
    )
    if (headerIndex < 0) return []

    const value = Number(String(row[headerIndex] || '').replace(/,/g, '').trim())
    if (!Number.isFinite(value)) return []

    return [
      {
        ...range,
        value,
      },
    ]
  })
}

function parseSimpleCsvRows(csvText) {
  return String(csvText || '')
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map(parseSimpleCsvLine)
}

function parseSimpleCsvLine(line) {
  const cells = []
  let cell = ''
  let quoted = false

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]
    const nextCharacter = line[index + 1]

    if (character === '"' && quoted && nextCharacter === '"') {
      cell += '"'
      index += 1
      continue
    }

    if (character === '"') {
      quoted = !quoted
      continue
    }

    if (character === ',' && !quoted) {
      cells.push(cell.trim())
      cell = ''
      continue
    }

    cell += character
  }

  cells.push(cell.trim())
  return cells
}

function normalizeCrimeHeader(value) {
  return String(value || '').replace(/\s+/g, '')
}

function getCrimeRangeCenterMinutes(range) {
  return (range.startMinutes + range.endMinutes) / 2
}

function interpolateCircularCrimeValue(minutes, anchors) {
  if (!anchors.length) return 0
  if (anchors.length === 1) return anchors[0].value

  const extendedAnchors = [
    {
      minutes: anchors[anchors.length - 1].minutes - DAY_MINUTES,
      value: anchors[anchors.length - 1].value,
    },
    ...anchors,
    {
      minutes: anchors[0].minutes + DAY_MINUTES,
      value: anchors[0].value,
    },
  ]

  for (let index = 0; index < extendedAnchors.length - 1; index += 1) {
    const current = extendedAnchors[index]
    const next = extendedAnchors[index + 1]

    if (minutes >= current.minutes && minutes <= next.minutes) {
      const progress = (minutes - current.minutes) / (next.minutes - current.minutes)
      return current.value + (next.value - current.value) * progress
    }
  }

  return anchors[0].value
}

function mapCrimeIntensityToOpacity(intensity) {
  const normalizedIntensity = Math.min(Math.max(intensity, 0), 1)
  return (
    ACTIVITY_RISK_DIM_MIN_OPACITY +
    (ACTIVITY_RISK_DIM_MAX_OPACITY - ACTIVITY_RISK_DIM_MIN_OPACITY) * normalizedIntensity
  )
}

function createFallbackCrimeRiskSlots() {
  const opacity = mapCrimeIntensityToOpacity(0.5)

  return Array.from({ length: DAY_MINUTES / HALF_HOUR_MINUTES }, (_, slotIndex) => {
    const startMinutes = slotIndex * HALF_HOUR_MINUTES
    return {
      slotIndex,
      startMinutes,
      endMinutes: startMinutes + HALF_HOUR_MINUTES,
      value: 0,
      intensity: 0.5,
      opacity,
    }
  })
}

function getGlobalMapDimOpacity(crimeOpacity) {
  return Math.min(0.38, 0.19 + (Number(crimeOpacity) || 0))
}

function getCurrentCrimeRisk(now = new Date()) {
  const minutes = now.getHours() * 60 + now.getMinutes()
  const slotIndex = Math.floor(minutes / HALF_HOUR_MINUTES)
  return ACTIVITY_CRIME_RISK_SLOTS[slotIndex] || createFallbackCrimeRiskSlots()[slotIndex]
}

function getNightLightLevel(now = new Date()) {
  const minutes = now.getHours() * 60 + now.getMinutes()
  const dawnStart = 5 * 60
  const dayStart = 8 * 60
  const duskStart = 17 * 60
  const nightStart = 20 * 60

  if (minutes < dawnStart || minutes >= nightStart) return 1
  if (minutes < dayStart) {
    return lerp(1, DAY_LIGHT_VISIBILITY, (minutes - dawnStart) / (dayStart - dawnStart))
  }
  if (minutes < duskStart) return DAY_LIGHT_VISIBILITY

  return lerp(DAY_LIGHT_VISIBILITY, 1, (minutes - duskStart) / (nightStart - duskStart))
}

function getNightLightRangeScale(level) {
  return 0.42 + 0.58 * level
}

function lerp(start, end, amount) {
  return start + (end - start) * Math.min(Math.max(amount, 0), 1)
}

async function fetchDataset(dataset, options) {
  if (!dataset.endpoint) {
    return { rawCount: 0, records: [], notice: '요청주소가 비어 있습니다.' }
  }

  const queryGroups = getDatasetQueryGroups(dataset, options)
  const rawRecords = []
  const requestErrors = []
  let selectedQueryGroup = ''

  for (const group of queryGroups) {
    const groupRecords = []
    const groupErrors = []

    for (const query of group.queries) {
      const result = await fetchDatasetQueryPages(dataset, options, query)
      groupRecords.push(...result.records)
      groupErrors.push(...result.errors)
    }

    if (groupRecords.length || !dataset.useLatestAvailableAccidentYear) {
      rawRecords.push(...groupRecords)
      requestErrors.push(...groupErrors)
      selectedQueryGroup = group.label
      break
    }

    requestErrors.push(...groupErrors)
  }

  if (!rawRecords.length && requestErrors.length) {
    throw new Error([...new Set(requestErrors)].join(', '))
  }

  const uniqueRecords = dedupeRecords(rawRecords)
  const records = []
  let geocoded = 0
  let locationLookups = 0

  if (dataset.locationLookup === 'playFacility') {
    locationLookups = await warmPlayFacilityLocationCache(
      uniqueRecords,
      options.serviceKey,
      options.geocoder,
    )
  }

  const normalizedRecords = await mapWithConcurrency(
    uniqueRecords,
    NORMALIZE_CONCURRENCY,
    (item) => normalizeRecord(item, dataset, {
      geocoder: options.geocoder,
      serviceKey: options.serviceKey,
      shouldLookup: dataset.locationLookup === 'playFacility',
    }),
  )

  for (const normalized of normalizedRecords) {
    if (normalized) {
      records.push(normalized)
      if (normalized.geocoded) geocoded += 1
    }
  }

  const skipped = uniqueRecords.length - records.length
  const noticeParts = []
  if (skipped > 0) noticeParts.push(`표시 제외 ${skipped}건(좌표/지역 불일치)`)
  if (geocoded > 0) noticeParts.push(`주소 변환 ${geocoded}건`)
  if (locationLookups > 0) noticeParts.push(`시설 위치 매칭 ${locationLookups}건`)
  if (requestErrors.length > 0) {
    noticeParts.push(`일부 요청 실패 ${requestErrors.length}건`)
  }
  if (selectedQueryGroup && selectedQueryGroup !== options.accidentYear) {
    noticeParts.push(`accidentYear ${selectedQueryGroup}`)
  }

  return {
    rawCount: uniqueRecords.length,
    records,
    notice: noticeParts.join(', '),
  }
}

async function fetchDatasetQueryPages(dataset, options, query) {
  const records = []
  const errors = []
  const { pageSize } = getPaginationConfig(query)

  for (let page = 1; page <= MAX_PAGES_PER_DATASET; page += 1) {
    try {
      const pagedQuery = getPagedQuery(query, page)
      const url = buildRequestUrl(dataset, options, pagedQuery)
      const response = await fetch(url)
      const text = await response.text()

      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`)
      }

      const payload = parsePayload(text)
      const apiError = findApiError(payload)
      if (apiError) {
        if (isNoDataPayload(payload)) break
        throw new Error(apiError)
      }

      const pageRecords = collectRecords(payload)
      records.push(...pageRecords)

      const totalCount = getPayloadTotalCount(payload)
      if (
        !pageRecords.length ||
        pageRecords.length < pageSize ||
        (totalCount > 0 && records.length >= totalCount)
      ) {
        break
      }
    } catch (error) {
      errors.push(error.message || '요청 실패')
      break
    }
  }

  if (records.length >= MAX_PAGES_PER_DATASET * pageSize) {
    errors.push(`최대 ${MAX_PAGES_PER_DATASET}페이지까지만 불러왔습니다.`)
  }

  return { records, errors }
}

function getDatasetQueries(dataset, { accidentYear }) {
  const query = typeof dataset.query === 'function' ? dataset.query({ accidentYear }) : null
  if (Array.isArray(query)) return query
  return [query || { type: 'json' }]
}

function getPaginationConfig(query = {}) {
  if ('pageIndex' in query || 'recordCountPerPage' in query) {
    return {
      pageKey: 'pageIndex',
      sizeKey: 'recordCountPerPage',
      pageSize: Number(query.recordCountPerPage) || DEFAULT_ROWS,
    }
  }

  return {
    pageKey: 'pageNo',
    sizeKey: 'numOfRows',
    pageSize: Number(query.numOfRows) || DEFAULT_ROWS,
  }
}

function getPagedQuery(query = {}, page) {
  const { pageKey, sizeKey, pageSize } = getPaginationConfig(query)
  return {
    ...query,
    [pageKey]: String(page),
    [sizeKey]: String(pageSize),
  }
}

function getDatasetQueryGroups(dataset, options) {
  if (!dataset.useLatestAvailableAccidentYear) {
    return [
      {
        label: '',
        queries: getDatasetQueries(dataset, options),
      },
    ]
  }

  const latestYear = Number(options.accidentYear)
  const years = Array.from({ length: ACCIDENT_YEAR_LOOKBACK }, (_, index) =>
    String(latestYear - index),
  ).filter((year) => Number.isFinite(Number(year)))

  return years.map((accidentYear) => ({
    label: accidentYear,
    queries: getDatasetQueries(dataset, { ...options, accidentYear }),
  }))
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

function isNoDataPayload(payload) {
  const flat = flattenObject(payload)
  const code = String(flat.resultCode || '').trim().toUpperCase()
  const message = String(flat.resultMsg || flat.returnAuthMsg || '').toUpperCase()

  return code === '03' || message.includes('NODATA')
}

function getPayloadTotalCount(payload) {
  const flat = flattenObject(payload)
  return parseCount(flat.totalCount || flat.totalCnt)
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
      context.geocoder,
    )
    if (location) {
      lat = location.lat
      lng = location.lng
      address = address || location.address
      lookupDetails = location.details
    }
  }

  let geocoded = false
  if (!isKoreanCoordinate(lat, lng) && address && !hasDaejeonRecordText(flat, address)) {
    return null
  }

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

  const metrics = getRecordMetrics(flat)
  const rangeRadius = getDataDrivenRadius(dataset, flat)
  const facilityId = readAny(flat, ['pfctSn', 'PFCT_SN', '놀이시설번호'])
  const title =
    readAny(flat, NAME_KEYS) ||
    address ||
    `${dataset.name} ${Math.abs(lat).toFixed(5)}, ${Math.abs(lng).toFixed(5)}`

  const normalized = {
    datasetId: dataset.id,
    datasetName: dataset.name,
    sourceUrl: dataset.sourceUrl,
    group: dataset.group,
    color: dataset.color,
    title: String(title),
    address: address ? String(address) : '',
    lat,
    lng,
    facilityId: facilityId ? String(facilityId) : '',
    geocoded,
    radius: rangeRadius,
    metrics,
    details: mergeDetails(
      [
        ...getMetricDetails(metrics),
        ...getRadiusDetails(rangeRadius),
      ],
      mergeDetails(pickDetails(flat), lookupDetails),
    ),
  }

  cachePlayFacilityLocation(flat, normalized)

  return normalized
}

async function warmPlayFacilityLocationCache(records, serviceKey, geocoder) {
  if (!serviceKey || !geocoder) return 0

  const ids = [
    ...new Set(
      records
        .filter(recordNeedsLocationLookup)
        .map((record) =>
          readAny(flattenObject(record), ['pfctSn', 'PFCT_SN', '놀이시설번호']),
        )
        .filter(hasValue)
        .map(String),
    ),
  ].filter((id) => !playFacilityLocationCache.has(id))

  let lookedUp = 0
  let cursor = 0

  const workers = Array.from(
    { length: Math.min(LOCATION_LOOKUP_CONCURRENCY, ids.length) },
    async () => {
      while (cursor < ids.length) {
        const id = ids[cursor]
        cursor += 1
        await lookupPlayFacilityLocation(id, serviceKey, geocoder)
        lookedUp += 1
      }
    },
  )

  await Promise.all(workers)
  return lookedUp
}

function recordNeedsLocationLookup(record) {
  const flat = flattenObject(record)
  const lat = parseCoordinate(readAny(flat, LAT_KEYS))
  const lng = parseCoordinate(readAny(flat, LNG_KEYS))
  return !isKoreanCoordinate(lat, lng)
}

async function mapWithConcurrency(items, concurrency, mapper) {
  if (!items.length) return []

  const results = new Array(items.length)
  let cursor = 0
  const workerCount = Math.min(concurrency, items.length)

  const workers = Array.from({ length: workerCount }, async () => {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      results[index] = await mapper(items[index], index)
    }
  })

  await Promise.all(workers)
  return results
}

function cachePlayFacilityLocation(record, normalized) {
  const pfctSn = readAny(record, ['pfctSn', 'PFCT_SN', '놀이시설번호'])
  if (!hasValue(pfctSn) || normalized.datasetId !== PLAY_FACILITY_DATASET_ID) return

  playFacilityLocationCache.set(String(pfctSn), {
    lat: normalized.lat,
    lng: normalized.lng,
    address: normalized.address,
    details: normalized.details.map((detail) => ({
      ...detail,
      label: `기본정보 ${detail.label}`,
    })),
  })
}

function hydratePlayFacilityLocationCache(dataset, records) {
  if (dataset.id !== PLAY_FACILITY_DATASET_ID) return

  records.forEach((record) => {
    if (!record.facilityId) return

    playFacilityLocationCache.set(String(record.facilityId), {
      lat: record.lat,
      lng: record.lng,
      address: record.address,
      details: (record.details || []).map((detail) => ({
        ...detail,
        label: `湲곕낯?뺣낫 ${detail.label}`,
      })),
    })
  })
}
async function lookupPlayFacilityLocation(pfctSn, serviceKey, geocoder) {
  if (!hasValue(pfctSn)) return null
  const cacheKey = String(pfctSn)
  if (playFacilityLocationCache.has(cacheKey)) {
    return playFacilityLocationCache.get(cacheKey)
  }

  const request = (async () => {
    const url = new URL('/data-api/1741000/pfc3/getPfctInfo3', window.location.origin)
    url.searchParams.set('serviceKey', serviceKey)
    url.searchParams.set('pageIndex', '1')
    url.searchParams.set('recordCountPerPage', '1')
    url.searchParams.set('pfctSn', cacheKey)

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
    let lat = parseCoordinate(readAny(flat, LAT_KEYS))
    let lng = parseCoordinate(readAny(flat, LNG_KEYS))
    const address = readAny(flat, ADDRESS_KEYS)

    if (!isKoreanCoordinate(lat, lng) && address && geocoder) {
      const point = await geocodeAddress(geocoder, address)
      if (point) {
        lat = point.lat
        lng = point.lng
      }
    }

    if (!isKoreanCoordinate(lat, lng)) {
      return null
    }

    return {
      lat,
      lng,
      address: address ? String(address) : '',
      details: pickDetails(flat).map((detail) => ({
        ...detail,
        label: `기본정보 ${detail.label}`,
      })),
    }
  })()
    .catch(() => null)
    .then((location) => {
      playFacilityLocationCache.set(cacheKey, location)
      return location
    })

  playFacilityLocationCache.set(cacheKey, request)
  return request
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

function searchKakaoPlace(query) {
  return new Promise((resolve, reject) => {
    if (!window.kakao?.maps?.services) {
      reject(new Error('카카오맵 검색을 사용할 수 없습니다.'))
      return
    }

    const places = new window.kakao.maps.services.Places()
    places.keywordSearch(query, (results, status) => {
      if (status === window.kakao.maps.services.Status.OK && results[0]) {
        resolve({
          name: results[0].place_name || query,
          address:
            results[0].road_address_name ||
            results[0].address_name ||
            '',
          lat: Number(results[0].y),
          lng: Number(results[0].x),
        })
        return
      }

      const geocoder = new window.kakao.maps.services.Geocoder()
      geocoder.addressSearch(query, (addressResults, addressStatus) => {
        if (
          addressStatus !== window.kakao.maps.services.Status.OK ||
          !addressResults[0]
        ) {
          reject(new Error('검색 결과가 없습니다. 다른 장소명을 입력해 보세요.'))
          return
        }

        resolve({
          name: query,
          address: addressResults[0].address_name || '',
          lat: Number(addressResults[0].y),
          lng: Number(addressResults[0].x),
        })
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

function getRecordMetrics(record) {
  return {
    accidentCount: parseCount(readAny(record, ['occrrnc_cnt', 'accidents', 'accidentCount'])),
    casualtyCount: parseCount(readAny(record, ['caslt_cnt', 'cs'])),
    deathCount: parseCount(readAny(record, ['dth_dnv_cnt', 'death'])),
    seriousInjuryCount: parseCount(readAny(record, ['se_dnv_cnt'])),
    minorInjuryCount: parseCount(readAny(record, ['sl_dnv_cnt'])),
    injuryReportCount: parseCount(readAny(record, ['wnd_dnv_cnt'])),
  }
}

function getMetricDetails(metrics) {
  return [
    ['사고건수', metrics.accidentCount, '건'],
    ['사상자수', metrics.casualtyCount, '명'],
    ['사망자수', metrics.deathCount, '명'],
    ['중상자수', metrics.seriousInjuryCount, '명'],
    ['경상자수', metrics.minorInjuryCount, '명'],
    ['부상신고자수', metrics.injuryReportCount, '명'],
  ]
    .filter(([, value]) => value > 0)
    .map(([label, value, unit]) => ({
      label,
      value: `${value.toLocaleString()}${unit}`,
    }))
}

function getRadiusDetails(radius) {
  if (!radius) return []
  return [{ label: '표시반경', value: `${Math.round(radius).toLocaleString()}m` }]
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
    'occrrnc_cnt',
    'caslt_cnt',
    'dth_dnv_cnt',
    'se_dnv_cnt',
    'sl_dnv_cnt',
    'wnd_dnv_cnt',
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

function parseCount(value) {
  if (!hasValue(value)) return 0
  const number = Number(String(value).replace(/,/g, '').trim())
  return Number.isFinite(number) ? number : 0
}

function parseArea(value) {
  if (!hasValue(value)) return 0
  const normalized = String(value).replace(/,/g, '').replace(/[^\d.]/g, '')
  const number = Number(normalized)
  return Number.isFinite(number) ? number : 0
}

function parseRadius(value) {
  if (!hasValue(value)) return 0
  const source = String(value).replace(/,/g, '').trim()
  const normalized = source.replace(/[^\d.]/g, '')
  const number = Number(normalized)
  if (!Number.isFinite(number) || number <= 0) return 0
  return /km|킬로/i.test(source) ? number * 1000 : number
}

function isKoreanCoordinate(lat, lng) {
  return lat >= 33 && lat <= 39.5 && lng >= 124 && lng <= 132
}

function hasDaejeonRecordText(record, extraText = '') {
  const regionText = [
    extraText,
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

  return regionText.includes(DAEJEON_REGION_NAME) || regionText.includes('대전')
}

function hasExcludedRegionRecordText(record, extraText = '') {
  const regionText = [
    extraText,
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
    record.CTPRVNNM,
    record.sido_sgg_nm,
  ]
    .filter(hasValue)
    .join(' ')

  return regionText.includes('세종')
}

function isDaejeonRegionCode(value) {
  return hasValue(value) && String(value).trim().startsWith('30')
}

function isDaejeonRecord(record, lat, lng) {
  if (hasExcludedRegionRecordText(record)) {
    return false
  }

  if (
    hasDaejeonRecordText(record) ||
    isDaejeonRegionCode(record.rgnCd) ||
    isDaejeonRegionCode(record.RGN_CD)
  ) {
    return true
  }

  return isWithinDaejeonCoordinateBounds(lat, lng)
}

function isDisplayableDaejeonRecord(record) {
  return isDaejeonRecord(record, record.lat, record.lng)
}

function isWithinDaejeonCoordinateBounds(lat, lng) {
  return (
    lat >= DAEJEON_COORDINATE_BOUNDS.south &&
    lat <= DAEJEON_COORDINATE_BOUNDS.north &&
    lng >= DAEJEON_COORDINATE_BOUNDS.west &&
    lng <= DAEJEON_COORDINATE_BOUNDS.east
  )
}

function mergeOverlappingTrafficSignals(records) {
  const trafficSignals = records.filter(isTrafficSignalRecord)
  if (trafficSignals.length < 2) return records

  const prepared = trafficSignals.map((record) => ({
    record,
    ...latLngToMeters(record.lat, record.lng),
    radius: getRecordRadius(record),
  }))
  const maxRadius = Math.max(...prepared.map((item) => item.radius))
  const cellSize = Math.max(maxRadius * 2, 32)
  const parent = prepared.map((_, index) => index)
  const signalIndex = new Map(prepared.map((item, index) => [item.record, index]))
  const grid = new Map()

  const find = (index) => {
    while (parent[index] !== index) {
      parent[index] = parent[parent[index]]
      index = parent[index]
    }
    return index
  }
  const union = (left, right) => {
    const leftRoot = find(left)
    const rightRoot = find(right)
    if (leftRoot !== rightRoot) parent[rightRoot] = leftRoot
  }

  prepared.forEach((item, index) => {
    const cellX = Math.floor(item.x / cellSize)
    const cellY = Math.floor(item.y / cellSize)
    const range = Math.ceil((item.radius + maxRadius) / cellSize)

    for (let x = cellX - range; x <= cellX + range; x += 1) {
      for (let y = cellY - range; y <= cellY + range; y += 1) {
        const nearby = grid.get(`${x}:${y}`) || []
        nearby.forEach((nearbyIndex) => {
          if (circlesOverlap(item, prepared[nearbyIndex])) {
            union(index, nearbyIndex)
          }
        })
      }
    }

    const key = `${cellX}:${cellY}`
    grid.set(key, [...(grid.get(key) || []), index])
  })

  const groups = new Map()
  prepared.forEach((_, index) => {
    const root = find(index)
    groups.set(root, [...(groups.get(root) || []), index])
  })

  const emitted = new Set()
  return records.flatMap((record) => {
    if (!isTrafficSignalRecord(record)) return [record]

    const index = signalIndex.get(record)
    const root = find(index)
    if (emitted.has(root)) return []
    emitted.add(root)

    const group = groups.get(root) || [index]
    if (group.length === 1) return [record]
    return [createMergedTrafficSignalRecord(group.map((itemIndex) => prepared[itemIndex]))]
  })
}

function annotateChildProtectionZoneOutlines(records) {
  const zones = records.filter(isChildProtectionZoneRecord)
  if (zones.length < 2) return records

  const prepared = zones.map((record) => ({
    record,
    ...latLngToMeters(record.lat, record.lng),
    radius: getRecordRadius(record),
  }))
  const maxRadius = Math.max(...prepared.map((item) => item.radius))
  const cellSize = Math.max(maxRadius * 2, 120)
  const parent = prepared.map((_, index) => index)
  const grid = new Map()

  const find = (index) => {
    while (parent[index] !== index) {
      parent[index] = parent[parent[index]]
      index = parent[index]
    }
    return index
  }
  const union = (left, right) => {
    const leftRoot = find(left)
    const rightRoot = find(right)
    if (leftRoot !== rightRoot) parent[rightRoot] = leftRoot
  }

  prepared.forEach((item, index) => {
    const cellX = Math.floor(item.x / cellSize)
    const cellY = Math.floor(item.y / cellSize)
    const range = Math.ceil((item.radius + maxRadius) / cellSize)

    for (let x = cellX - range; x <= cellX + range; x += 1) {
      for (let y = cellY - range; y <= cellY + range; y += 1) {
        const nearby = grid.get(`${x}:${y}`) || []
        nearby.forEach((nearbyIndex) => {
          if (circlesOverlap(item, prepared[nearbyIndex])) {
            union(index, nearbyIndex)
          }
        })
      }
    }

    const key = `${cellX}:${cellY}`
    grid.set(key, [...(grid.get(key) || []), index])
  })

  const groups = new Map()
  prepared.forEach((_, index) => {
    const root = find(index)
    groups.set(root, [...(groups.get(root) || []), index])
  })

  const zoneIndex = new Map(prepared.map((item, index) => [item.record, index]))

  return records.map((record) => {
    if (!isChildProtectionZoneRecord(record)) return record

    const index = zoneIndex.get(record)
    if (index === undefined) return record
    const root = find(index)
    const group = groups.get(root) || [index]
    if (group.length === 1) return record

    return createAnnotatedChildProtectionZoneRecord(
      prepared[index],
      group.map((itemIndex) => prepared[itemIndex]),
    )
  })
}

function dedupeActivityDisplayRecords(records) {
  const groups = new Map()

  records.forEach((record) => {
    const key = getActivityDisplayKey(record)
    if (!key) return
    groups.set(key, [...(groups.get(key) || []), record])
  })

  const emitted = new Set()
  return records.flatMap((record) => {
    const key = getActivityDisplayKey(record)
    if (!key) return [record]
    if (emitted.has(key)) return []

    emitted.add(key)
    const group = groups.get(key) || [record]
    return [mergeActivityDisplayGroup(group)]
  })
}

function getActivityDisplayKey(record) {
  if (!isActivityRecord(record)) return ''
  if (record.facilityId) return `facility:${record.facilityId}`

  const title = normalizeDisplayText(record.title)
  const address = normalizeDisplayText(record.address)
  if (title && address) return `title-address:${title}:${address}`
  if (title) return `title-point:${title}:${getDisplayPointKey(record)}`
  if (address) return `address:${address}`

  return `point:${getDisplayPointKey(record)}`
}

function mergeActivityDisplayGroup(records) {
  if (records.length === 1) return records[0]

  const primary =
    records.find((record) => record.datasetId === PLAY_FACILITY_DATASET_ID) ||
    records.find((record) => record.datasetId === ACTIVITY_EXCELLENT_DATASET_ID) ||
    records[0]
  const radius = Math.max(...records.map((record) => getRecordRadius(record)))
  const datasetNames = [...new Set(records.map((record) => record.datasetName))]
  const mergedDetails = mergeDetails(
    [
      { label: '표시 병합', value: `${records.length.toLocaleString()}개 자료` },
      { label: '포함 자료', value: datasetNames.join(', ') },
    ],
    records.flatMap((record) => record.details || []),
  )

  return {
    ...primary,
    radius,
    details: mergedDetails,
  }
}

function normalizeDisplayText(value) {
  return hasValue(value) ? String(value).replace(/\s+/g, '').trim().toLowerCase() : ''
}

function getDisplayPointKey(record) {
  return `${Math.round(record.lat * 10000)}:${Math.round(record.lng * 10000)}`
}

function createMergedTrafficSignalRecord(items) {
  const centerX = items.reduce((sum, item) => sum + item.x, 0) / items.length
  const centerY = items.reduce((sum, item) => sum + item.y, 0) / items.length
  const center = metersToLatLng(centerX, centerY)
  const baseRecord = items[0].record
  const radius = getRecordRadius(baseRecord)
  const countLabel = items.length.toLocaleString()

  return {
    ...baseRecord,
    lat: center.lat,
    lng: center.lng,
    radius,
    title: `${baseRecord.datasetName} ${countLabel}개 묶음`,
    address: '',
    details: [
      { label: '묶은 신호등', value: `${countLabel}개` },
      { label: '표시반경', value: `${Math.round(radius).toLocaleString()}m` },
    ],
  }
}

function createAnnotatedChildProtectionZoneRecord(item, groupItems) {
  return {
    ...item.record,
    displayShape: 'child-zone-outline',
    childZoneGroupSize: groupItems.length,
    childZoneCircle: {
      lat: item.record.lat,
      lng: item.record.lng,
      radius: item.radius,
    },
    outlineSegments: createCircleUnionOutlineSegments(item, groupItems),
  }
}

function createCircleUnionOutlineSegments(item, items) {
  const segmentCount = 144

  const visibleSegments = Array.from({ length: segmentCount }, (_, index) => {
    const angle = (Math.PI * 2 * (index + 0.5)) / segmentCount
    const midpoint = {
      x: item.x + Math.cos(angle) * item.radius,
      y: item.y + Math.sin(angle) * item.radius,
    }

    return !items.some(
      (other) =>
        other !== item &&
        Math.hypot(midpoint.x - other.x, midpoint.y - other.y) < other.radius - 0.5,
    )
  })

  if (visibleSegments.every(Boolean)) {
    return [
      Array.from({ length: segmentCount + 1 }, (_, index) =>
        circlePointToLatLng(item, index % segmentCount, segmentCount),
      ),
    ]
  }

  const firstHiddenIndex = visibleSegments.findIndex((visible) => !visible)
  const paths = []
  let currentPath = null

  for (let offset = 1; offset <= segmentCount; offset += 1) {
    const index = (firstHiddenIndex + offset) % segmentCount
    const visible = visibleSegments[index]

    if (visible && !currentPath) {
      currentPath = [circlePointToLatLng(item, index, segmentCount)]
    }

    if (visible && currentPath) {
      currentPath.push(circlePointToLatLng(item, index + 1, segmentCount))
    }

    if (!visible && currentPath) {
      if (currentPath.length >= 2) paths.push(currentPath)
      currentPath = null
    }
  }

  if (currentPath?.length >= 2) paths.push(currentPath)
  return paths
}

function circlePointToLatLng(item, index, segmentCount) {
  const angle = (Math.PI * 2 * index) / segmentCount
  return metersToLatLng(
    item.x + Math.cos(angle) * item.radius,
    item.y + Math.sin(angle) * item.radius,
  )
}

function latLngToMeters(lat, lng) {
  const metersPerLat = 111_320
  const metersPerLng = metersPerLat * Math.cos((DAEJEON_CENTER.lat * Math.PI) / 180)

  return {
    x: (lng - DAEJEON_CENTER.lng) * metersPerLng,
    y: (lat - DAEJEON_CENTER.lat) * metersPerLat,
  }
}

function metersToLatLng(x, y) {
  const metersPerLat = 111_320
  const metersPerLng = metersPerLat * Math.cos((DAEJEON_CENTER.lat * Math.PI) / 180)

  return {
    lat: DAEJEON_CENTER.lat + y / metersPerLat,
    lng: DAEJEON_CENTER.lng + x / metersPerLng,
  }
}

function circlesOverlap(left, right) {
  return Math.hypot(left.x - right.x, left.y - right.y) <= left.radius + right.radius
}

function extendBoundsForRecord(bounds, record) {
  if (hasChildZoneUnionShape(record)) {
    const circle = record.childZoneCircle
    const center = new window.kakao.maps.LatLng(circle.lat, circle.lng)
    bounds.extend(center)
    record.outlineSegments.forEach((segment) =>
      segment.forEach((point) =>
        bounds.extend(new window.kakao.maps.LatLng(point.lat, point.lng)),
      ),
    )
    return
  }

  bounds.extend(new window.kakao.maps.LatLng(record.lat, record.lng))

  const radius = getVisualRecordRadius(record)
  if (!radius) return

  const metersPerLat = 111_320
  const metersPerLng = metersPerLat * Math.cos((record.lat * Math.PI) / 180)
  const latOffset = radius / metersPerLat
  const lngOffset = radius / metersPerLng

  bounds.extend(new window.kakao.maps.LatLng(record.lat + latOffset, record.lng + lngOffset))
  bounds.extend(new window.kakao.maps.LatLng(record.lat - latOffset, record.lng - lngOffset))
}

function getVisualRecordRadius(record) {
  const radius = getRecordRadius(record)
  if (isAccidentZoneRecord(record)) return radius * 1.14
  if (isChildProtectionZoneRecord(record)) return radius * 1.08
  return radius
}

function getRangeOverlayRadius(record) {
  if (isChildProtectionZoneRecord(record)) return getRecordRadius(record)
  return isAccidentZoneRecord(record) ? getRecordRadius(record) : getVisualRecordRadius(record)
}

function getRecordRadius(record) {
  if (record.radius) return record.radius
  if (isSecurityLightRecord(record)) return 6
  if (isTrafficSignalRecord(record)) return 18
  if (isChildProtectionZoneRecord(record)) return CHILD_PROTECTION_ZONE_DEFAULT_RADIUS_METERS
  if (record.group === '도로시설') return 45
  if (record.group === '어린이놀이시설') return 70
  return 90
}

function isSecurityLightRecord(record) {
  return record.datasetId === '15110685'
}

function isTrafficSignalRecord(record) {
  return record.datasetId === TRAFFIC_SIGNAL_DATASET_ID
}

function isChildProtectionZoneRecord(record) {
  return record.datasetId === CHILD_PROTECTION_ZONE_DATASET_ID
}

function isActivityRecord(record) {
  return ACTIVITY_DATASET_IDS.includes(record.datasetId)
}

function isParkRecord(record) {
  return record.datasetId === '15007270'
}

function isAccidentZoneRecord(record) {
  return record.datasetId === '15058311' || record.datasetId === '15058925'
}

function isMarkerlessRecord(record) {
  return (
    isAccidentZoneRecord(record) ||
    isChildProtectionZoneRecord(record) ||
    isParkRecord(record) ||
    isSecurityLightRecord(record) ||
    isTrafficSignalRecord(record)
  )
}

function getDataDrivenRadius(dataset, record) {
  if (dataset.useLatestAvailableAccidentYear) return ACCIDENT_ZONE_RADIUS_METERS

  if (dataset.id === CHILD_PROTECTION_ZONE_DATASET_ID) {
    return parseRadius(readAny(record, RADIUS_KEYS)) || CHILD_PROTECTION_ZONE_DEFAULT_RADIUS_METERS
  }

  if (dataset.id === '15007270') {
    return areaToDisplayRadius(readAny(record, ['parkArea', 'park_area']))
  }

  return null
}

function areaToDisplayRadius(areaValue) {
  const area = parseArea(areaValue)
  if (!area) return null

  const equivalentRadius = Math.sqrt(area / Math.PI)
  return Math.min(Math.max(equivalentRadius, 30), 600)
}

function createRangeOverlays(
  record,
  position,
  map,
  nightLightLevel = 1,
  crimeVisualLevel = 1,
) {
  if (isSecurityLightRecord(record)) return []
  if (isActivityRecord(record) && !isParkRecord(record)) return []

  const style = getRangeOverlayStyle(record, 'normal')
  const baseOptions = {
    map,
    strokeColor: record.color,
    fillColor: record.color,
    zIndex: 1,
    ...style,
  }
  const overlays = []

  if (hasChildZoneUnionShape(record)) {
    const circle = record.childZoneCircle
    const center = new window.kakao.maps.LatLng(circle.lat, circle.lng)
    const fillOverlay = new window.kakao.maps.Circle({
      map,
      center,
      radius: circle.radius,
      ...getChildProtectionFillOverlayStyle('normal'),
    })
    fillOverlay.overlayRole = 'child-zone-fill'
    overlays.push(fillOverlay)

    record.outlineSegments.forEach((segment) => {
      const outlineOverlay = new window.kakao.maps.Polyline({
        map,
        path: createKakaoLinePath(segment),
        ...getChildProtectionOutlineOverlayStyle('normal'),
      })
      outlineOverlay.overlayRole = 'child-zone-outline'
      overlays.push(outlineOverlay)
    })

    return overlays
  }

  if (isTrafficSignalRecord(record)) {
    const signalHalfSize =
      getRangeOverlayRadius(record) * getNightLightRangeScale(nightLightLevel)
    const signalOverlay = new window.kakao.maps.Polygon({
      map,
      path: createMeterSquarePath(record.lat, record.lng, signalHalfSize),
      ...getRangeOverlayStyle(record, 'normal', nightLightLevel),
    })
    signalOverlay.overlayRole = 'range'
    overlays.push(signalOverlay)

    return overlays
  }

  if (usesSafetyLightOverlay(record)) {
    const lightOverlay = new window.kakao.maps.Circle({
      map,
      center: position,
      radius: getVisualRecordRadius(record) * 1.28,
      ...getSafetyLightOverlayStyle('normal'),
    })
    lightOverlay.overlayRole = 'safety-light'
    overlays.push(lightOverlay)
  }

  const rangeOverlay = new window.kakao.maps.Circle({
    ...baseOptions,
    center: position,
    radius: getRangeOverlayRadius(record),
  })
  rangeOverlay.overlayRole = 'range'
  overlays.push(rangeOverlay)

  if (isAccidentZoneRecord(record)) {
    const darkOverlay = new window.kakao.maps.Circle({
      map,
      center: position,
      radius: getVisualRecordRadius(record),
      ...getAccidentDarkOverlayStyle('normal', crimeVisualLevel),
    })
    darkOverlay.overlayRole = 'accident-dark'
    overlays.push(darkOverlay)
  }

  return overlays
}

function createMeterSquarePath(lat, lng, halfSizeMeters) {
  const metersPerLat = 111_320
  const metersPerLng = metersPerLat * Math.cos((lat * Math.PI) / 180)
  const latOffset = halfSizeMeters / metersPerLat
  const lngOffset = halfSizeMeters / metersPerLng

  return [
    new window.kakao.maps.LatLng(lat - latOffset, lng - lngOffset),
    new window.kakao.maps.LatLng(lat - latOffset, lng + lngOffset),
    new window.kakao.maps.LatLng(lat + latOffset, lng + lngOffset),
    new window.kakao.maps.LatLng(lat + latOffset, lng - lngOffset),
  ]
}

function hasChildZoneUnionShape(record) {
  return (
    record.displayShape === 'child-zone-outline' &&
    record.childZoneCircle &&
    Array.isArray(record.outlineSegments)
  )
}

function createKakaoLinePath(path) {
  return path.map((point) => new window.kakao.maps.LatLng(point.lat, point.lng))
}

function getOverlayStyle(
  record,
  overlay,
  state,
  nightLightLevel = 1,
  crimeVisualLevel = 1,
) {
  if (overlay.overlayRole === 'child-zone-fill') {
    return getChildProtectionFillOverlayStyle(state)
  }
  if (overlay.overlayRole === 'child-zone-outline') {
    return getChildProtectionOutlineOverlayStyle(state)
  }
  if (overlay.overlayRole === 'safety-light') return getSafetyLightOverlayStyle(state)
  if (overlay.overlayRole === 'accident-dark') {
    return getAccidentDarkOverlayStyle(state, crimeVisualLevel)
  }
  return getRangeOverlayStyle(record, state, nightLightLevel)
}

function ensureMapCanvas(container, className) {
  if (!container) return null

  const host = getKakaoMapCanvasHost(container)
  const existingCanvas = container.querySelector(`.${className}`)
  if (existingCanvas) {
    if (existingCanvas.parentElement !== host) {
      host.appendChild(existingCanvas)
    }
    return existingCanvas
  }

  const canvas = document.createElement('canvas')
  canvas.className = className
  canvas.setAttribute('aria-hidden', 'true')
  host.appendChild(canvas)
  return canvas
}

function getKakaoMapCanvasHost(container) {
  return (
    Array.from(container.children).find(
      (child) => child instanceof HTMLElement && child.tagName === 'DIV',
    ) || container
  )
}

function ensureSecurityLightCanvas(container) {
  return ensureMapCanvas(container, 'security-light-canvas')
}

function drawMapDimCanvas(canvas, opacity) {
  const rect = canvas.getBoundingClientRect()
  const width = Math.round(rect.width)
  const height = Math.round(rect.height)
  const dpr = window.devicePixelRatio || 1
  const scaledWidth = Math.max(1, Math.round(width * dpr))
  const scaledHeight = Math.max(1, Math.round(height * dpr))

  if (canvas.width !== scaledWidth || canvas.height !== scaledHeight) {
    canvas.width = scaledWidth
    canvas.height = scaledHeight
  }

  const context = canvas.getContext('2d')
  if (!context) return

  context.setTransform(dpr, 0, 0, dpr, 0, 0)
  context.clearRect(0, 0, width, height)
  context.globalAlpha = Math.min(Math.max(opacity, 0), 0.6)
  context.fillStyle = '#020304'
  context.fillRect(0, 0, width, height)
  context.globalAlpha = 1
}

function drawChildProtectionGlowCanvas(canvas, map, records, crimeVisualLevel = 1) {
  const rect = canvas.getBoundingClientRect()
  const width = Math.round(rect.width)
  const height = Math.round(rect.height)
  const dpr = window.devicePixelRatio || 1
  const scaledWidth = Math.max(1, Math.round(width * dpr))
  const scaledHeight = Math.max(1, Math.round(height * dpr))

  if (canvas.width !== scaledWidth || canvas.height !== scaledHeight) {
    canvas.width = scaledWidth
    canvas.height = scaledHeight
  }

  const context = canvas.getContext('2d')
  if (!context) return

  context.setTransform(dpr, 0, 0, dpr, 0, 0)
  context.clearRect(0, 0, width, height)
  if (!records.length || !width || !height) return

  const glowLevel = getCrimeVisualLevel(crimeVisualLevel)
  if (glowLevel <= 0) return

  const maskCanvas = document.createElement('canvas')
  maskCanvas.width = scaledWidth
  maskCanvas.height = scaledHeight
  const maskContext = maskCanvas.getContext('2d')
  if (!maskContext) return

  maskContext.setTransform(dpr, 0, 0, dpr, 0, 0)
  maskContext.fillStyle = '#ffffff'

  const projection = map.getProjection()
  records.forEach((record) => {
    const circle = getChildProtectionGlowCircle(record)
    const center = projection.containerPointFromCoords(
      new window.kakao.maps.LatLng(circle.lat, circle.lng),
    )
    const radius = metersToContainerPixels(map, circle.lat, circle.lng, circle.radius)

    if (
      center.x < -radius ||
      center.y < -radius ||
      center.x > width + radius ||
      center.y > height + radius
    ) {
      return
    }

    maskContext.beginPath()
    maskContext.arc(center.x, center.y, radius, 0, Math.PI * 2)
    maskContext.fill()
  })

  context.save()
  context.globalAlpha = 0.34 * glowLevel
  context.fillStyle = '#fff2b3'
  context.fillRect(0, 0, width, height)
  context.globalAlpha = 1
  context.globalCompositeOperation = 'destination-in'
  context.drawImage(maskCanvas, 0, 0, width, height)
  context.restore()
}

function getChildProtectionGlowCircle(record) {
  const source = record.childZoneCircle || record
  return {
    lat: source.lat,
    lng: source.lng,
    radius: getVisualRecordRadius(record) * 1.28,
  }
}

function metersToContainerPixels(map, lat, lng, meters) {
  const projection = map.getProjection()
  const centerPoint = projection.containerPointFromCoords(
    new window.kakao.maps.LatLng(lat, lng),
  )
  const metersPerLat = 111_320
  const metersPerLng = metersPerLat * Math.cos((lat * Math.PI) / 180)
  const edgePoint = projection.containerPointFromCoords(
    new window.kakao.maps.LatLng(lat, lng + meters / metersPerLng),
  )

  return Math.abs(edgePoint.x - centerPoint.x)
}

function drawSecurityLightCanvas(canvas, map, records, nightLightLevel = 1) {
  const rect = canvas.getBoundingClientRect()
  const width = Math.round(rect.width)
  const height = Math.round(rect.height)
  const dpr = window.devicePixelRatio || 1
  const scaledWidth = Math.max(1, Math.round(width * dpr))
  const scaledHeight = Math.max(1, Math.round(height * dpr))

  if (canvas.width !== scaledWidth || canvas.height !== scaledHeight) {
    canvas.width = scaledWidth
    canvas.height = scaledHeight
  }

  const context = canvas.getContext('2d')
  if (!context) return

  context.setTransform(dpr, 0, 0, dpr, 0, 0)
  context.clearRect(0, 0, width, height)
  if (!records.length || !width || !height) return

  const projection = map.getProjection()
  const pointStyle = getSecurityLightCanvasPointStyle(map.getLevel(), nightLightLevel)
  records.forEach((record) => {
    const point = projection.containerPointFromCoords(
      new window.kakao.maps.LatLng(record.lat, record.lng),
    )
    const x = point.x
    const y = point.y

    if (
      x < -pointStyle.outerRadius ||
      y < -pointStyle.outerRadius ||
      x > width + pointStyle.outerRadius ||
      y > height + pointStyle.outerRadius
    ) {
      return
    }

    context.beginPath()
    context.fillStyle = `rgba(255, 216, 77, ${pointStyle.outerOpacity})`
    context.arc(x, y, pointStyle.outerRadius, 0, Math.PI * 2)
    context.fill()

    context.beginPath()
    context.fillStyle = `rgba(255, 216, 77, ${pointStyle.middleOpacity})`
    context.arc(x, y, pointStyle.middleRadius, 0, Math.PI * 2)
    context.fill()

    context.beginPath()
    context.fillStyle = `rgba(255, 216, 77, ${pointStyle.innerOpacity})`
    context.strokeStyle = `rgba(255, 255, 255, ${pointStyle.strokeOpacity})`
    context.lineWidth = pointStyle.strokeWidth
    context.arc(x, y, pointStyle.innerRadius, 0, Math.PI * 2)
    context.fill()
    if (pointStyle.strokeWidth > 0) context.stroke()
  })
}

function getSecurityLightCanvasPointStyle(mapLevel, nightLightLevel = 1) {
  const zoomOutSteps = Math.max(0, mapLevel - 5)
  const zoomInSteps = Math.max(0, 5 - mapLevel)
  const scale = Math.max(0.14, 1 - zoomOutSteps * 0.2)
  const lightLevel = Math.min(Math.max(nightLightLevel, DAY_LIGHT_VISIBILITY), 1)
  const rangeScale = getNightLightRangeScale(lightLevel)
  const zoomInOpacityScale = Math.max(0.58, 1 - zoomInSteps * 0.14)

  return {
    innerRadius: Math.max(0.35, 2.2 * scale * rangeScale),
    middleRadius: Math.max(0.5, 3 * scale * rangeScale),
    outerRadius: Math.max(0.75, 5 * scale * rangeScale),
    outerOpacity: 0.13 * scale * lightLevel * zoomInOpacityScale,
    middleOpacity: 0.36 * scale * lightLevel * zoomInOpacityScale,
    innerOpacity: 0.65 * lightLevel * zoomInOpacityScale,
    strokeOpacity: 0.62 * lightLevel * zoomInOpacityScale,
    strokeWidth: scale > 0.5 ? 1 : 0,
  }
}

function createMapHoverCardState(record, position, map) {
  const point = map.getProjection().containerPointFromCoords(position)

  return {
    record,
    x: point.x,
    y: point.y,
  }
}

function showRecordInfoWindow(record, position, infoWindow, map) {
  if (!infoWindow || !map) return

  infoWindow.setContent(createHoverCardContent(record))
  infoWindow.setPosition(position)
  if (typeof infoWindow.setZIndex === 'function') {
    infoWindow.setZIndex(1000000)
  }
  infoWindow.open(map)
}

function createHoverCardContent(record) {
  const details = (record.details || [])
    .slice(0, 5)
    .map(
      (detail) => `
        <div>
          <span>${escapeHtml(detail.label)}</span>
          <strong>${escapeHtml(detail.value)}</strong>
        </div>
      `,
    )
    .join('')
  const address = record.address
    ? `<p class="hover-card__address">${escapeHtml(record.address)}</p>`
    : ''
  const source = record.sourceUrl
    ? `<p class="hover-card__source">${escapeHtml(record.sourceUrl)}</p>`
    : ''

  return `
    <article class="hover-card">
      <div class="hover-card__head" style="border-left-color: ${escapeHtml(record.color)}">
        <span>${escapeHtml(record.datasetName)}</span>
        <strong>${escapeHtml(record.title)}</strong>
      </div>
      ${address}
      ${details ? `<div class="hover-card__details">${details}</div>` : ''}
      ${source}
    </article>
  `
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function getRangeOverlayStyle(record, state, nightLightLevel = 1) {
  if (isTrafficSignalRecord(record)) {
    const lightLevel = Math.min(Math.max(nightLightLevel, DAY_LIGHT_VISIBILITY), 1)
    return state === 'hover'
      ? {
          strokeColor: '#ffffff',
          fillColor: '#ffffff',
          strokeWeight: 2,
          strokeOpacity: 0.18 + 0.82 * lightLevel,
          fillOpacity: 0.1 + 0.82 * lightLevel,
          zIndex: 6,
        }
      : {
          strokeColor: '#ffffff',
          fillColor: '#ffffff',
          strokeWeight: 1,
          strokeOpacity: 0.12 + 0.83 * lightLevel,
          fillOpacity: 0.08 + 0.7 * lightLevel,
          zIndex: 6,
        }
  }

  if (isSecurityLightRecord(record)) {
    return state === 'hover'
      ? {
          strokeColor: record.color,
          fillColor: record.color,
          strokeWeight: 2,
          strokeOpacity: 0.95,
          fillOpacity: 0.44,
          zIndex: 6,
        }
      : {
          strokeColor: record.color,
          fillColor: record.color,
          strokeWeight: 1,
          strokeOpacity: 0.88,
          fillOpacity: 0.3,
          zIndex: 6,
        }
  }

  if (isChildProtectionZoneRecord(record)) {
    return state === 'hover'
      ? {
          strokeColor: record.color,
          fillColor: record.color,
          strokeWeight: 3,
          strokeOpacity: 0.95,
          fillOpacity: 0.16,
          zIndex: 6,
        }
      : {
          strokeColor: record.color,
          fillColor: record.color,
          strokeWeight: hasChildZoneUnionShape(record) ? 3 : 2,
          strokeOpacity: 0.9,
          fillOpacity: hasChildZoneUnionShape(record) ? 0.06 : 0.12,
          zIndex: 6,
        }
  }

  if (isAccidentZoneRecord(record)) {
    return state === 'hover'
      ? {
          strokeColor: record.color,
          fillColor: record.color,
          strokeWeight: 2,
          strokeOpacity: 0.9,
          fillOpacity: 0.2,
          zIndex: 6,
        }
      : {
          strokeColor: record.color,
          fillColor: record.color,
          strokeWeight: 1,
          strokeOpacity: 0.82,
          fillOpacity: 0.12,
          zIndex: 6,
        }
  }

  return state === 'hover'
    ? { strokeWeight: 4, strokeOpacity: 0.9, fillOpacity: 0.28, zIndex: 4 }
    : { strokeWeight: 2, strokeOpacity: 0.85, fillOpacity: 0.16, zIndex: 4 }
}

function usesSafetyLightOverlay(record) {
  return false
}

function getChildProtectionFillOverlayStyle(state) {
  return state === 'hover'
    ? {
        strokeWeight: 0,
        strokeOpacity: 0,
        fillColor: '#16a34a',
        fillOpacity: 0.12,
        zIndex: 5,
      }
    : {
        strokeWeight: 0,
        strokeOpacity: 0,
        fillColor: '#16a34a',
        fillOpacity: 0.045,
        zIndex: 5,
      }
}

function getChildProtectionOutlineOverlayStyle(state) {
  return state === 'hover'
    ? {
        strokeColor: '#15803d',
        strokeWeight: 4,
        strokeOpacity: 0.96,
        zIndex: 7,
      }
    : {
        strokeColor: '#16a34a',
        strokeWeight: 3,
        strokeOpacity: 0.92,
        zIndex: 7,
      }
}

function getSafetyLightOverlayStyle(state) {
  return state === 'hover'
    ? {
        strokeColor: '#fff6a8',
        fillColor: '#fff0a6',
        strokeWeight: 0,
        strokeOpacity: 0,
        fillOpacity: 0.5,
        zIndex: 5,
        clickable: false,
      }
    : {
        strokeColor: '#fff6b8',
        fillColor: '#fff2b3',
        strokeWeight: 0,
        strokeOpacity: 0,
        fillOpacity: 0.34,
        zIndex: 5,
        clickable: false,
      }
}

function getAccidentDarkOverlayStyle(state, crimeVisualLevel = 1) {
  const darkLevel = getCrimeVisualLevel(crimeVisualLevel)

  return state === 'hover'
    ? {
        strokeColor: '#05070a',
        fillColor: '#020304',
        strokeWeight: 0,
        strokeOpacity: 0,
        fillOpacity: 0.36 * darkLevel,
        zIndex: 7,
        clickable: false,
      }
    : {
        strokeColor: '#05070a',
        fillColor: '#020304',
        strokeWeight: 0,
        strokeOpacity: 0,
        fillOpacity: 0.24 * darkLevel,
        zIndex: 7,
        clickable: false,
      }
}

function getCrimeVisualLevel(intensity) {
  return Math.min(Math.max(Number(intensity) || 0, 0), 1)
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

function createActivityStickerMarkerImage(record, mapLevel = 7) {
  const color = escapeSvgColor(record.color)
  const symbol = getActivityMarkerSymbol(record)
  const size = getActivityStickerMarkerSize(mapLevel)
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36">
      <filter id="shadow" x="-35%" y="-25%" width="170%" height="170%">
        <feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#111827" flood-opacity="0.22"/>
      </filter>
      <g filter="url(#shadow)">
        <circle cx="18" cy="18" r="15" fill="#ffffff"/>
        <circle cx="18" cy="18" r="11" fill="${color}" opacity="0.94"/>
        <circle cx="18" cy="18" r="14" fill="none" stroke="#ffffff" stroke-width="3"/>
      </g>
      ${symbol}
    </svg>`

  return new window.kakao.maps.MarkerImage(
    `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    new window.kakao.maps.Size(size, size),
    { offset: new window.kakao.maps.Point(size / 2, size / 2) },
  )
}

function getActivityStickerMarkerSize(mapLevel) {
  if (mapLevel <= 4) return 22
  if (mapLevel === 5) return 18

  return 16
}

function isActivityStickerVisible(mapLevel) {
  return mapLevel >= 4 && mapLevel <= 5
}

function getActivityMarkerSymbol(record) {
  const color = escapeSvgColor(record.color)

  if (record.datasetId === '15007270') {
    return `
      <path d="M19 9c3.8 3 5.8 6.2 5.8 9.3 0 3.7-2.5 6.2-5.8 6.2s-5.8-2.5-5.8-6.2C13.2 15.2 15.2 12 19 9Z" fill="#ffffff"/>
      <path d="M19 15v10" stroke="#2f9e44" stroke-width="1.7" stroke-linecap="round"/>
    `
  }

  if (record.datasetId === ACTIVITY_EXCELLENT_DATASET_ID) {
    return `
      <path d="m19 8.8 2.2 5 5.4.5-4.1 3.6 1.2 5.3-4.7-2.7-4.7 2.7 1.2-5.3-4.1-3.6 5.4-.5L19 8.8Z" fill="#ffffff"/>
    `
  }

  if (record.datasetId === '15124524') {
    return `
      <path d="M13.5 16.6 17.6 21l7-8.2" fill="none" stroke="#ffffff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    `
  }

  if (record.datasetId === '15124521') {
    return `
      <circle cx="15" cy="20.4" r="2.1" fill="#ffffff"/>
      <circle cx="23" cy="20.4" r="2.1" fill="#ffffff"/>
      <path d="M14 19.8h10l-1.5-6.4h-7L14 19.8Z" fill="none" stroke="#ffffff" stroke-width="2" stroke-linejoin="round"/>
    `
  }

  return `
    <path d="M13 14.8c0-2.8 2.2-5 5-5h2c2.8 0 5 2.2 5 5v1.3c0 2.8-2.2 5-5 5h-1v3.1h-2v-3.1h-1c-2.8 0-5-2.2-5-5v-1.3Z" fill="#ffffff"/>
    <circle cx="16" cy="15.7" r="1.3" fill="${color}"/>
    <circle cx="22" cy="15.7" r="1.3" fill="${color}"/>
  `
}

function escapeSvgColor(color) {
  return /^#[0-9a-f]{3,8}$/i.test(color) ? color : '#3e63dd'
}

export default App
