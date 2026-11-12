// Every string the user sees (SPEC 1 C4, SPEC 8). Code, comments and keys are English.
// E-mail template text is SPEC section 7 verbatim (approved by the owner, D12, D20).

const MONTHS = [
  'január', 'február', 'március', 'április', 'május', 'június',
  'július', 'augusztus', 'szeptember', 'október', 'november', 'december',
] as const

export const hu = {
  appName: 'ParkStop',
  tagline: 'Szabálytalan parkolás bejelentése Budapesten',

  nav: {
    history: 'Előzmények',
    settings: 'Beállítások',
    back: 'Vissza',
    comingSoon: 'Ez a rész a következő verzióban érkezik.',
  },

  sheet: {
    collapse: 'Panel összecsukása',
    expand: 'Panel kinyitása',
  },

  steps: {
    where: 'Hely',
    details: 'Adatok',
    mail: 'E-mail',
    progress: (n: number, total: number) => `${n} / ${total}`,
    label: (n: number, name: string) => `${n} · ${name}`,
  },

  start: {
    title: 'Hol áll a szabálytalanul parkoló autó?',
    introPhone: 'Koppints a térképre a hely megjelöléséhez, vagy keress rá a címre.',
    introPc: 'Kattints a térképre, vagy keress rá a címre. A jelölőt arrébb is húzhatod.',
    photoButton: 'Fotó készítése vagy kiválasztása',
    photoAdded: (n: number) => `${n} fotó hozzáadva. Most jelöld meg a helyet a térképen.`,
    dropPhotos: 'Húzd ide a fotókat',
    dropHint: 'Legfeljebb 5 kép. A gépeden maradnak, sehova nem töltjük fel őket.',
    choosePhotos: 'Fotók kiválasztása',
    locate: 'Saját helyzetem',
    howTitle: 'Így működik',
    how: [
      'Megjelölöd a helyet, mi megmondjuk, melyik hatóság az illetékes.',
      'Megadod a rendszámot és a szabálysértés típusát.',
      'A kész e-mailt a saját leveleződből küldöd el.',
    ],
  },

  map: {
    label: 'Budapest térképe',
    searchLabel: 'Cím keresése',
    searchPlaceholder: 'Cím keresése',
    searchSubmit: 'Keresés',
    searching: 'Keresés…',
    noResults: 'Nincs találat Budapesten.',
    searchError: 'A címkeresés most nem érhető el. Jelöld a helyet a térképen.',
    resultsLabel: 'Találatok',
    locate: 'Saját helyzetem',
    locating: 'Helymeghatározás…',
    geoErrorTitle: 'A helyzetedet nem érjük el',
    geoErrorBody: 'Engedélyezd a helymeghatározást a böngészőben, vagy jelöld a helyet a térképen.',
    geoUnsupported: 'Ez a böngésző nem tud helyet meghatározni. Jelöld a helyet a térképen.',
    tapHint: 'Koppints a térképre a hely megjelöléséhez',
    clickHint: 'Kattints a térképre a hely megjelöléséhez',
    zoomIn: 'Nagyítás',
    zoomOut: 'Kicsinyítés',
    legendCapital: 'fővárosi kezelésű út',
    attribution: '© OpenStreetMap közreműködők',
    attributionToggle: 'Térképadatok forrása',
    pinLabel: 'Jelölő — húzd a pontos helyre',
    loadErrorTitle: 'Nincs internetkapcsolat',
    loadErrorBody: 'A térkép és a címkeresés most nem érhető el. A bejelentést így is elkészítheted, a címet kézzel írd be.',
  },

  address: {
    label: 'Cím',
    placeholder: 'pl. Pannónia utca 14.',
    edit: 'Módosítás',
    done: 'Kész',
    looking: 'Cím keresése…',
    notFound: 'A címet nem találtuk — írd be kézzel.',
    missing: 'Add meg a címet.',
    coords: (lat: string, lon: string) => `GPS: ${lat}, ${lon}`,
  },

  authority: {
    heading: 'Illetékes hatóság',
    loading: 'Illetékes hatóság keresése…',
    loadError: 'A hatósági adatokat nem sikerült betölteni. Frissítsd az oldalt.',
    confidence: {
      biztos: 'biztos',
      'valószínű': 'valószínű',
      bizonytalan: 'bizonytalan',
    },
    reason: {
      districtStreet: 'Kerületi kezelésű utca — itt a kerület saját közterület-felügyelete intézkedik.',
      noOwnBody: 'A kerületnek nincs saját közterület-felügyelete, ezért a FÖRI intézkedik.',
      capitalRoad: (road: string) => `Fővárosi kezelésű út (${road}) — itt a FÖRI intézkedik.`,
      capitalRoadEdge: (road: string, m: number) =>
        `A jelölő ${m} méterre van egy fővárosi kezelésű úttól (${road}). Ha az autó a mellékutcában áll, válaszd lent a kerületi felügyeletet.`,
      capitalRoadUnplaced: (road: string) =>
        `Fővárosi kezelésű útszakasz (${road}), de a szakasz vége a térképen nem pontos — ellenőrizd a címzettet.`,
      capitalSquare: (road: string) =>
        `Fővárosi kezelésű tér vagy terület (${road}) — itt jellemzően a FÖRI intézkedik, de a tér egyes részei a kerülethez tartozhatnak.`,
      districtActsOn: (road: string) =>
        `Fővárosi út (${road}), de a megállapodás szerint itt a kerület felügyelete ellenőrzi a parkolást.`,
      districtActsOnPartial: (road: string, section: string) =>
        `${road}: a kerület felügyelete csak az út egy részén intézkedik (${section}). Ha az autó ott áll, válaszd lent a kerületet.`,
      noDistrict: (area: string) =>
        `${area}: nem tartozik kerülethez, a főváros közvetlenül kezeli — itt a FÖRI intézkedik.`,
    },
    nearBorder: (roman: string) =>
      `A jelölő kerülethatár közelében van. Ha az autó a szomszéd kerületben áll (${roman}. kerület), válaszd lent azt.`,
    stale: 'Az adat több mint 12 hónapja volt ellenőrizve — a hivatalos oldalon érdemes megnézni.',
    verified: (date: string) => `Adat ellenőrizve: ${date}`,
    source: 'Hivatalos forrás',
    chooseLegend: 'Kinek küldöd?',
    changeRecipient: 'Más címzettet választok',
    role: {
      recommended: 'Ajánlott ezen a helyen',
      fori: 'Fővárosi kezelésű utakon intézkedik',
      district: 'Kerületi utcákon intézkedik',
      neighbour: 'Szomszédos kerület',
      police: 'Szabálysértési feljelentéshez',
    },
    phoneTitle: 'Még ott áll az autó?',
    phoneHint: 'Telefonálj: a járőr csak addig tud intézkedni, amíg az autó a helyszínen van.',
    phoneFirst: 'Ez a felügyelet a bejelentéseket telefonon kéri.',
    call: (phone: string) => `Hívás: ${phone}`,
    noEmail: 'nincs ellenőrzött e-mail cím',
    policeChosen: 'Rendőrségi címzettnél a levél szabálysértési feljelentés ismeretlen elkövető ellen.',
    continue: 'Bejelentés készítése',
    outsideTitle: 'Ez a hely Budapesten kívül esik',
    outsideBody: 'A ParkStop egyelőre csak Budapesten tudja megmondani, ki az illetékes.',
    outsideMove: 'Jelölő áthelyezése',
  },

  report: {
    title: 'Bejelentés',
    photos: 'Fotók',
    photoCount: (n: number, max: number) => `${n} / ${max}`,
    addPhoto: 'Fotó hozzáadása',
    photoAlt: (n: number) => `${n}. fotó`,
    removePhoto: (n: number) => `${n}. fotó törlése`,
    photosHint: 'A fotók a készülékeden maradnak, sehova nem töltjük fel őket.',
    photoUnreadable: (name: string) =>
      `„${name}”: ezt a képet a böngésző nem tudja megnyitni. Kérlek, JPEG-et válassz.`,
    tooMany: (max: number) => `Legfeljebb ${max} fotót csatolhatsz.`,
    plate: 'Rendszám',
    plateCountry: 'H',
    plateUnusual: 'külföldi / egyedi formátum',
    violation: 'Szabálysértés típusa',
    violationChoose: 'Válassz…',
    customViolation: 'Mi a szabálytalanság?',
    customViolationPlaceholder: 'pl. a jármű a kerékpártároló előtt áll',
    time: 'Időpont',
    timeNow: 'Most',
    vehicle: 'Jármű leírása',
    vehiclePlaceholder: 'pl. szürke Opel Astra',
    optional: '(nem kötelező)',
    note: 'Megjegyzés',
    notePlaceholder: 'pl. babakocsival nem lehet elférni a járdán',
    counter: (n: number, max: number) => `${n} / ${max}`,
    filledTime: 'Az idő a fotóból lett kitöltve.',
    timeFromPhoto: 'a fotóból',
    tip: 'Tipp: jelentsd minél hamarabb — a járőr csak addig tud intézkedni, amíg az autó ott áll.',
    continue: 'Tovább az e-mailhez',
    fixErrors: 'Javítsd a megjelölt mezőket.',
    errors: {
      photos: 'Adj hozzá legalább egy fotót.',
      plate: 'Add meg a rendszámot.',
      violation: 'Válaszd ki a szabálysértés típusát.',
      custom: 'Írd le röviden, mi a szabálytalanság.',
      time: 'Add meg az időpontot.',
      timeFuture: 'Az időpont nem lehet a jövőben.',
      address: 'Add meg a címet.',
    },
  },

  mail: {
    title: 'E-mail piszkozat',
    to: 'Címzett',
    subject: 'Tárgy',
    body: 'Szöveg',
    copy: 'Másolás',
    copyTo: 'Címzett másolása',
    copySubject: 'Tárgy másolása',
    copyBody: 'Szöveg másolása',
    copied: 'Kimásolva',
    copyFailed: 'A másolás nem sikerült — jelöld ki a szöveget, és másold kézzel.',
    photosCount: (n: number) => `${n} fotó`,
    photosPreparing: 'Fotók kicsinyítése…',
    photosReadyPhone: 'Kicsinyítve, mentésre készen',
    photosReadyPc: 'A levélhez te adod hozzá őket',
    photosFailed: 'A fotókat nem sikerült előkészíteni.',
    photosSomeFailed: (names: string) => `Ezeket a fotókat nem sikerült kicsinyíteni, csatold az eredetit: ${names}`,
    savePhotos: 'Fotók mentése',
    downloadPhotos: 'Fotók letöltése',
    photosSaved: (n: number) =>
      `${n} fotó mentése elindult — a Letöltések mappában találod. Ha a böngésző rákérdez, engedélyezd a több fájl letöltését.`,
    copyPhoto: 'Fotó másolása',
    copyPhotoDone: 'A fotó a vágólapon — illeszd be a levélbe (Ctrl+V).',
    copyPhotoFailed: 'Ez a böngésző nem tud képet a vágólapra tenni. Használd a „Fotók letöltése” gombot.',
    open: 'Megnyitás levelezőben',
    hintPhone: 'A címzett, a tárgy és a szöveg kitöltve nyílik meg. A levelezőben a gemkapocs ikonnal csatold a mentett fotókat.',
    hintPc: 'A megnyíló levélhez csatold a letöltött fotókat, vagy illeszd be a kimásolt képet (Ctrl+V).',
    longBody: 'A szöveg túl hosszú ahhoz, hogy a levelező közvetlenül átvegye, ezért a vágólapra másoltuk. A megnyíló levélben illeszd be a szöveg helyére.',
    longBodyCopyFailed: 'A szöveg túl hosszú a közvetlen átadáshoz. Másold ki a „Másolás” gombbal, és illeszd be a levélbe.',
    noEmail: 'Ennek a hatóságnak nincs ellenőrzött e-mail címe. Telefonon vagy a honlapján érheted el; a szöveget a „Másolás” gombokkal viheted át.',
    signatureHint: 'A levél végére, az aláírásba a levelezőben írd be a neved és az elérhetőséged — a hatóságok általában csak azonosítható bejelentőnek válaszolnak.',
    policeNote: 'Ez szabálysértési feljelentés a kerületi rendőrkapitányságnak.',
  },

  // SPEC 7 templates A and B. Plain text; one line per paragraph so mail apps can reflow.
  mailTemplate: {
    subjectA: (plate: string, address: string) => `Szabálytalan parkolás bejelentése – ${plate} – ${address}`,
    subjectB: (plate: string, address: string) => `Szabálysértési feljelentés – ${plate} – ${address}`,
    greeting: (name: string) => `Tisztelt ${name}!`,
    reportB: 'Szabálysértési feljelentést teszek ismeretlen elkövető ellen.',
    observed: (date: string, time: string) =>
      `${date} ${time}-kor az alábbi helyen szabálytalanul várakozó járművet észleltem:`,
    labelPlace: 'Helyszín:',
    labelPlate: 'Rendszám:',
    labelVehicle: 'Jármű:',
    labelViolation: 'Szabálytalanság:',
    labelNote: 'Megjegyzés:',
    district: (roman: string) => `${roman}. kerület`,
    gps: (lat: string, lon: string) => `GPS: ${lat}, ${lon}`,
    closingA: (n: number) =>
      `A helyszínen készített ${n} fényképet mellékelem. Kérem az ügy kivizsgálását és a szükséges intézkedés megtételét, valamint tájékoztatást az eljárás menetéről.`,
    closingB: (n: number) =>
      `A helyszínen készített ${n} fényképet bizonyítékként mellékelem. Kérem az ügy kivizsgálását és a szükséges intézkedés megtételét, valamint tájékoztatást az eljárás menetéről.`,
    signoff: 'Tisztelettel:',
    months: MONTHS,
  },

  done: {
    title: 'Átadva a levelezőnek',
    intro: 'A bejelentést te küldöd el a saját leveleződből. Mielőtt elküldöd, nézd át ezt a három dolgot.',
    step1Phone: 'Csatold a mentett fotókat: koppints a gemkapocs ikonra, és válaszd ki őket.',
    step1Pc: 'Csatold a letöltött fotókat, vagy illeszd be a kimásolt képet (Ctrl+V).',
    step2: 'Ellenőrizd, hogy a címzett, a tárgy és a szöveg megvan, és minden fotó csatolva van.',
    step3: 'Küldd el a levelet.',
    saveAgain: 'Fotók mentése újra',
    handedAt: (time: string) => `Átadva a levelezőnek: ${time}`,
    disclaimer: 'A ParkStop nem látja, hogy a levél elment-e.',
    newReport: 'Új bejelentés',
    backToMail: 'Vissza az e-mailhez',
  },
} as const

export type Strings = typeof hu
