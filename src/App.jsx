import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

const DAEJEON_CENTER = { lat: 36.3504, lng: 127.3845 }
const DEFAULT_ROWS = 500
const ACCIDENT_YEAR_LOOKBACK = 5
const ACCIDENT_ZONE_RADIUS_METERS = 186
const MAX_PAGES_PER_DATASET = 300
const LOCATION_LOOKUP_CONCURRENCY = 8
const NORMALIZE_CONCURRENCY = 8
const LATEST_ACCIDENT_YEAR = String(new Date().getFullYear() - 1)
const DAEJEON_REGION_NAME = '대전광역시'
const DAEJEON_GU_GUN_CODES = ['110', '140', '170', '200', '230']
const ACTIVITY_EXCELLENT_DATASET_ID = '15124527'
const PLAY_FACILITY_DATASET_ID = '15124519'
const CATEGORY_OPTIONS = [
  {
    id: 'safety',
    label: '아동 안전',
    datasetIds: ['15058311', '15058925', '15110685', '15110672', '15110706'],
  },
  {
    id: 'activity',
    label: '아동 활동',
    datasetIds: ['15007270', '15124527', '15124524', '15124521', PLAY_FACILITY_DATASET_ID],
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
      rgnNm: DAEJEON_REGION_NAME,
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
  CRSLKKND: '횡단보도 종류',
  BCYCLCRSLKCMBNATYN: '자전거 횡단 겸용',
  HIGHLANDYN: '고원식 여부',
  CARTRKCO: '차로수',
  SGNLLKNND: '신호등 종류',
  managementNumber: '관리번호',
  ntatcSeq: '공고번호',
  regDtTm: '등록일',
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

function App() {
  const mapContainerRef = useRef(null)
  const mapRef = useRef(null)
  const geocoderRef = useRef(null)
  const clustererRef = useRef(null)
  const markerRefs = useRef([])
  const rangeRefs = useRef([])
  const infoWindowRef = useRef(null)
  const searchMarkerRef = useRef(null)
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
  const [selectedCategories, setSelectedCategories] = useState({
    safety: true,
    activity: false,
  })
  const [selectedRecord, setSelectedRecord] = useState(null)
  const [searchText, setSearchText] = useState('')
  const [searchTarget, setSearchTarget] = useState('')
  const [searchVersion, setSearchVersion] = useState(0)
  const [searchLocation, setSearchLocation] = useState(null)
  const [hasSearched, setHasSearched] = useState(false)
  const [searchState, setSearchState] = useState({
    loading: false,
    error: '',
  })
  const [isLoadingData, setIsLoadingData] = useState(false)
  const [activityFilter, setActivityFilter] = useState('all')

  const activeRecords = useMemo(() => {
    const datasetIds = new Set()

    CATEGORY_OPTIONS.forEach((category) => {
      if (!selectedCategories[category.id]) return

      if (category.id === 'activity' && activityFilter === 'excellent') {
        datasetIds.add(ACTIVITY_EXCELLENT_DATASET_ID)
        return
      }

      category.datasetIds.forEach((datasetId) => datasetIds.add(datasetId))
    })

    return DATASETS.flatMap((dataset) => {
      if (!datasetIds.has(dataset.id)) return []
      return results[dataset.id]?.records || []
    })
  }, [activityFilter, results, selectedCategories])

  const categorySummary = useMemo(() => {
    return CATEGORY_OPTIONS.map((category) => ({
      ...category,
      count: category.datasetIds.reduce(
        (sum, datasetId) => sum + (results[datasetId]?.mappedCount || 0),
        0,
      ),
    }))
  }, [results])

  const activitySummary = useMemo(() => {
    const activityCategory = CATEGORY_OPTIONS.find((option) => option.id === 'activity')
    return {
      all: activityCategory?.datasetIds.reduce(
        (sum, datasetId) => sum + (results[datasetId]?.mappedCount || 0),
        0,
      ) || 0,
      excellent: results[ACTIVITY_EXCELLENT_DATASET_ID]?.mappedCount || 0,
    }
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
            calculator: CLUSTER_STEPS,
            styles: CLUSTER_STYLES,
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
    if (!hasSearched || !mapContainerRef.current) return
    loadKakaoMap()
  }, [hasSearched, loadKakaoMap])

  useEffect(() => {
    if (!mapState.ready || !mapRef.current) return

    markerRefs.current.forEach((marker) => marker.setMap(null))
    markerRefs.current = []
    rangeRefs.current.forEach((overlay) => overlay.setMap(null))
    rangeRefs.current = []
    clustererRef.current?.clear()
    infoWindowRef.current?.close()

    if (!activeRecords.length) return

    const bounds = new window.kakao.maps.LatLngBounds()
    const markers = activeRecords.flatMap((record) => {
      const position = new window.kakao.maps.LatLng(record.lat, record.lng)
      const rangeOverlays = createRangeOverlays(record, position, mapRef.current)
      const showRangeInfo = () => {
        rangeOverlays.forEach((overlay) =>
          overlay.setOptions(getRangeOverlayStyle(record, 'hover')),
        )
      }
      const hideRangeInfo = () => {
        rangeOverlays.forEach((overlay) =>
          overlay.setOptions(getRangeOverlayStyle(record, 'normal')),
        )
      }

      rangeOverlays.forEach((overlay) => {
        window.kakao.maps.event.addListener(overlay, 'mouseover', showRangeInfo)
        window.kakao.maps.event.addListener(overlay, 'mouseout', hideRangeInfo)
        window.kakao.maps.event.addListener(overlay, 'click', () => {
          setSelectedRecord(record)
        })
      })

      bounds.extend(position)
      rangeRefs.current.push(...rangeOverlays)

      if (isMarkerlessRecord(record)) {
        return []
      }

      const marker = new window.kakao.maps.Marker({
        position,
        title: record.title,
        image: createMarkerImage(record.color),
      })

      window.kakao.maps.event.addListener(marker, 'mouseover', () => {
        rangeOverlays.forEach((overlay) =>
          overlay.setOptions(getRangeOverlayStyle(record, 'hover')),
        )
      })
      window.kakao.maps.event.addListener(marker, 'mouseout', hideRangeInfo)
      window.kakao.maps.event.addListener(marker, 'click', () => {
        setSelectedRecord(record)
      })

      return [marker]
    })

    markerRefs.current = markers

    if (clustererRef.current) {
      clustererRef.current.addMarkers(markers)
    } else {
      markers.forEach((marker) => marker.setMap(mapRef.current))
    }

    if (searchLocation) return

    if (activeRecords.length === 1) {
      const [record] = activeRecords
      mapRef.current.setCenter(new window.kakao.maps.LatLng(record.lat, record.lng))
      mapRef.current.setLevel(4)
    } else {
      mapRef.current.setBounds(bounds)
    }
  }, [activeRecords, mapState.ready, searchLocation])

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
      const [result] = await Promise.allSettled([fetchDataset(dataset, loadOptions)])
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

  const toggleCategory = (categoryId) => {
    setSelectedCategories((current) => ({
      ...current,
      [categoryId]: !current[categoryId],
    }))
    setSelectedRecord(null)
  }

  const selectActivityFilter = (filter) => {
    setActivityFilter(filter)
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
            <section className="category-tabs" aria-label="정보 분류">
              {categorySummary.map((category) => (
                <button
                  aria-pressed={selectedCategories[category.id]}
                  className={selectedCategories[category.id] ? 'is-active' : ''}
                  key={category.id}
                  onClick={() => toggleCategory(category.id)}
                  type="button"
                >
                  <strong>{category.label}</strong>
                  <span>{category.count.toLocaleString()}건</span>
                </button>
              ))}
            </section>

            {selectedCategories.activity ? (
              <section className="activity-filter" aria-label="아동 활동 필터">
                <div className="segmented-control">
                  <button
                    className={activityFilter === 'all' ? 'is-active' : ''}
                    onClick={() => selectActivityFilter('all')}
                    type="button"
                  >
                    전체 {activitySummary.all.toLocaleString()}
                  </button>
                  <button
                    className={activityFilter === 'excellent' ? 'is-active' : ''}
                    onClick={() => selectActivityFilter('excellent')}
                    type="button"
                  >
                    우수 시설 {activitySummary.excellent.toLocaleString()}
                  </button>
                </div>
              </section>
            ) : null}

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
                    {getSelectionMessage(selectedCategories)}
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

function getSelectionMessage(selectedCategories) {
  if (selectedCategories.safety && selectedCategories.activity) {
    return '주변 아동 안전 정보와 아동 활동 공간을 함께 표시하고 있습니다.'
  }
  if (selectedCategories.activity) {
    return '주변 아동 활동 공간을 표시하고 있습니다.'
  }
  if (selectedCategories.safety) {
    return '주변 아동 안전 정보를 표시하고 있습니다.'
  }
  return '선택된 정보 분류가 없습니다.'
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

function isDaejeonRegionCode(value) {
  return hasValue(value) && String(value).trim().startsWith('30')
}

function isDaejeonRecord(record, lat, lng) {
  if (
    hasDaejeonRecordText(record) ||
    isDaejeonRegionCode(record.rgnCd) ||
    isDaejeonRegionCode(record.RGN_CD)
  ) {
    return true
  }

  return lat >= 36.0 && lat <= 36.7 && lng >= 126.95 && lng <= 127.75
}

function getRecordRadius(record) {
  if (record.radius) return record.radius
  if (isSecurityLightRecord(record)) return 6
  if (isTrafficSignalRecord(record)) return 13.5
  if (isCrosswalkRecord(record)) return 22.5
  if (record.group === '도로시설') return 45
  if (record.group === '어린이놀이시설') return 70
  return 90
}

function isSecurityLightRecord(record) {
  return record.datasetId === '15110685'
}

function isCrosswalkRecord(record) {
  return record.datasetId === '15110672'
}

function isTrafficSignalRecord(record) {
  return record.datasetId === '15110706'
}

function isAccidentZoneRecord(record) {
  return record.datasetId === '15058311' || record.datasetId === '15058925'
}

function isMarkerlessRecord(record) {
  return (
    isAccidentZoneRecord(record) ||
    isSecurityLightRecord(record) ||
    isTrafficSignalRecord(record) ||
    isCrosswalkRecord(record)
  )
}

function getDataDrivenRadius(dataset, record) {
  if (dataset.useLatestAvailableAccidentYear) return ACCIDENT_ZONE_RADIUS_METERS

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

function createRangeOverlays(record, position, map) {
  const style = getRangeOverlayStyle(record, 'normal')
  const baseOptions = {
    map,
    strokeColor: record.color,
    fillColor: record.color,
    zIndex: 1,
    ...style,
  }

  return [
    new window.kakao.maps.Circle({
      ...baseOptions,
      center: position,
      radius: getRecordRadius(record),
    }),
  ]
}

function getRangeOverlayStyle(record, state) {
  if (isSecurityLightRecord(record)) {
    return state === 'hover'
      ? { strokeWeight: 2, strokeOpacity: 1, fillOpacity: 0.95 }
      : { strokeWeight: 1, strokeOpacity: 0.9, fillOpacity: 0.72 }
  }

  return state === 'hover'
    ? { strokeWeight: 4, strokeOpacity: 0.9, fillOpacity: 0.28 }
    : { strokeWeight: 2, strokeOpacity: 0.85, fillOpacity: 0.16 }
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

export default App
