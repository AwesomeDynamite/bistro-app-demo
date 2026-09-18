import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

const STORAGE_KEYS = {
  users: 'bistro_users',
  menu: 'bistro_menu',
  requests: 'bistro_requests',
  orders: 'bistro_orders',
  carts: 'bistro_carts',
  session: 'bistro_session',
}

const API_STATE_URL = '/api/bistro/state'
const API_COLLECTION_URLS = {
  users: '/api/bistro/users',
  menu: '/api/bistro/menu',
  requests: '/api/bistro/requests',
  orders: '/api/bistro/orders',
}

const ORDER_SYNC_CHANNEL = 'bistro_orders_sync'
const USER_SYNC_CHANNEL = 'bistro_users_sync'

/** Kitchen statuses (bistro can set). Teachers may set cancelled. */
const ORDER_STATUSES = [
  { value: 'ordered', label: 'Ordered' },
  { value: 'preparing', label: 'Preparing' },
  { value: 'ready', label: 'Ready for pickup' },
]

const ORDER_STATUS_KITCHEN = ['ordered', 'preparing', 'ready']

const CANCELLED_STATUS = 'cancelled'

const starterMenu = [
  { id: 1, name: 'Chicken Caesar Wrap', price: 6.5, category: 'Lunch', addedAt: 1714000000001 },
  { id: 2, name: 'Tomato Soup', price: 3.25, category: 'Soup', addedAt: 1714000000002 },
  { id: 3, name: 'Fruit Cup', price: 2.5, category: 'Snack', addedAt: 1714000000003 },
]

const starterUsers = [
  {
    id: 1,
    name: 'Central Bistro Admin',
    email: 'bistro@school.edu',
    password: 'demo123',
    role: 'bistro_admin',
  },
]

function normalizeUsers(raw) {
  if (!Array.isArray(raw)) return starterUsers
  return raw.map((u) => {
    if (u.id === 1 && u.email === 'bistro@school.edu' && u.role === 'bistro') {
      return { ...u, role: 'bistro_admin' }
    }
    return u
  })
}

function readStorage(key, fallback) {
  try {
    const saved = localStorage.getItem(key)
    return saved ? JSON.parse(saved) : fallback
  } catch {
    return fallback
  }
}

function saveStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value))
}

async function fetchServerState() {
  const response = await fetch(API_STATE_URL, { cache: 'no-store' })
  if (!response.ok) throw new Error('Unable to load Bistro server data.')
  return response.json()
}

async function saveServerCollection(collection, value) {
  const response = await fetch(API_COLLECTION_URLS[collection], {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(value),
  })
  if (!response.ok) throw new Error(`Unable to save ${collection}.`)
  return response.json()
}

function normalizeMenu(raw) {
  if (!Array.isArray(raw)) return starterMenu
  return raw.map((item, i) => ({
    ...item,
    addedAt: typeof item.addedAt === 'number' ? item.addedAt : item.id || Date.now() - i,
  }))
}

function orderSortKey(o) {
  if (typeof o.sortKey === 'number' && !Number.isNaN(o.sortKey)) return o.sortKey
  if (typeof o.id === 'number' && !Number.isNaN(o.id)) return o.id
  const m = String(o.id ?? '').match(/^ord-(\d+)/)
  return m ? parseInt(m[1], 10) : 0
}

function normalizeOrders(raw) {
  if (!Array.isArray(raw)) return []
  const kitchen = new Set(ORDER_STATUSES.map((s) => s.value))
  kitchen.add(CANCELLED_STATUS)
  return raw.map((o) => {
    let status = o.status
    if (status === 'received') status = 'ordered'
    if (!kitchen.has(status)) status = 'ordered'
    const sortKey = orderSortKey({ ...o, status })
    return { ...o, status, sortKey }
  })
}

function parseStoredOrders(value) {
  try {
    return normalizeOrders(JSON.parse(value))
  } catch {
    return null
  }
}

function parseStoredUsers(value) {
  try {
    return normalizeUsers(JSON.parse(value))
  } catch {
    return null
  }
}

/** localStorage JSON may coerce ids; keep updates reliable */
function sameOrderId(a, b) {
  return a === b || String(a) === String(b)
}

function IconHome({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 9.5L12 3l9 6.5V21H3V9.5z" strokeLinejoin="round" />
      <path d="M9 21V12h6v9" strokeLinejoin="round" />
    </svg>
  )
}

function IconMenu({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 6h16M4 12h16M4 18h10" strokeLinecap="round" />
    </svg>
  )
}

function IconAccount({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c1.5-4 6.5-6 8-6s6.5 2 8 6" strokeLinecap="round" />
    </svg>
  )
}

function IconCart({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 6h15l-1.5 9h-12z" strokeLinejoin="round" />
      <circle cx="9" cy="20" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="17" cy="20" r="1.5" fill="currentColor" stroke="none" />
      <path d="M6 6 5 3H2" strokeLinecap="round" />
    </svg>
  )
}

function IconOrders({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" strokeLinecap="round" />
      <path d="M9 5a2 2 0 012-2h2a2 2 0 012 2v0a2 2 0 01-2 2h-2a2 2 0 01-2-2v0z" />
      <path d="M9 12h6M9 16h4" strokeLinecap="round" />
    </svg>
  )
}

function IconTeam({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" strokeLinecap="round" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" strokeLinecap="round" />
    </svg>
  )
}

function App() {
  const [users, setUsers] = useState(() =>
    normalizeUsers(readStorage(STORAGE_KEYS.users, starterUsers)),
  )
  const [menu, setMenu] = useState(() => normalizeMenu(readStorage(STORAGE_KEYS.menu, starterMenu)))
  const [requests, setRequests] = useState(() => readStorage(STORAGE_KEYS.requests, []))
  const [orders, setOrders] = useState(() =>
    normalizeOrders(readStorage(STORAGE_KEYS.orders, [])),
  )
  const [cartsByEmail, setCartsByEmail] = useState(() => readStorage(STORAGE_KEYS.carts, {}))

  const [authMode, setAuthMode] = useState('login')
  const [activeRole, setActiveRole] = useState('teacher')
  const [currentUser, setCurrentUser] = useState(null)
  const [activePage, setActivePage] = useState('home')
  /** Desktop: cart opens as sidebar popout (always available for teachers) */
  const [cartPopoutOpen, setCartPopoutOpen] = useState(false)
  const [ordersPopoutOpen, setOrdersPopoutOpen] = useState(false)
  const [accountPopoutOpen, setAccountPopoutOpen] = useState(false)
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 769px)').matches,
  )

  const [authForm, setAuthForm] = useState({
    name: '',
    email: '',
    password: '',
  })
  const [foodForm, setFoodForm] = useState({
    name: '',
    category: '',
    price: '',
  })
  const [requestText, setRequestText] = useState('')
  const [ordersRefreshError, setOrdersRefreshError] = useState('')

  const [mgmtBistro, setMgmtBistro] = useState({ name: '', email: '', password: '' })
  const [mgmtTeacher, setMgmtTeacher] = useState({ name: '', email: '', password: '' })
  const [editingUserId, setEditingUserId] = useState(null)
  const [editForm, setEditForm] = useState({ name: '', email: '', password: '' })
  const [accountForm, setAccountForm] = useState({ name: '', email: '', password: '' })

  const cartPanelRef = useRef(null)
  const cartSidebarBtnRef = useRef(null)
  const ordersPanelRef = useRef(null)
  const ordersSidebarBtnRef = useRef(null)
  const accountPanelRef = useRef(null)
  const accountSidebarBtnRef = useRef(null)
  const ordersSyncChannelRef = useRef(null)
  const lastOrdersJsonRef = useRef(JSON.stringify(orders))
  const usersSyncChannelRef = useRef(null)
  const lastUsersJsonRef = useRef(JSON.stringify(users))
  const lastMenuJsonRef = useRef(JSON.stringify(menu))
  const lastRequestsJsonRef = useRef(JSON.stringify(requests))

  const isTeacher = currentUser?.role === 'teacher'
  const isBistroAdmin = currentUser?.role === 'bistro_admin'
  const isBistroStaff = currentUser?.role === 'bistro' || isBistroAdmin

  const navItemsList = useMemo(() => {
    const items = [
      { id: 'home', label: 'Home', Icon: IconHome },
      { id: 'menu', label: 'Menu', Icon: IconMenu },
      { id: 'orders', label: 'Orders', Icon: IconOrders, isOrders: isTeacher },
    ]
    if (isBistroAdmin) {
      items.push({ id: 'management', label: 'Team', Icon: IconTeam, isManagement: true })
    }
    if (isTeacher) items.push({ id: 'cart', label: 'Cart', Icon: IconCart, isCart: true })
    items.push({ id: 'account', label: 'Account', Icon: IconAccount })
    return items
  }, [isTeacher, isBistroAdmin])

  const teacherCart = useMemo(() => {
    if (!currentUser?.email) return []
    return cartsByEmail[currentUser.email] || []
  }, [cartsByEmail, currentUser?.email])

  const setTeacherCart = useCallback(
    (nextLines) => {
      if (!currentUser?.email) return
      setCartsByEmail((prev) => {
        const next = { ...prev, [currentUser.email]: nextLines }
        saveStorage(STORAGE_KEYS.carts, next)
        return next
      })
    },
    [currentUser?.email],
  )

  const cartTotal = useMemo(
    () => teacherCart.reduce((sum, line) => sum + line.price * line.qty, 0),
    [teacherCart],
  )
  const cartCount = useMemo(() => teacherCart.reduce((sum, line) => sum + line.qty, 0), [teacherCart])

  const threeNewestItems = useMemo(() => {
    return [...menu].sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0)).slice(0, 3)
  }, [menu])

  const totalTeacherOrders = useMemo(
    () => orders.filter((order) => order.teacherEmail === currentUser?.email),
    [orders, currentUser],
  )

  const applyUsersList = useCallback((nextUsers) => {
    const normalizedUsers = normalizeUsers(nextUsers)
    const usersJson = JSON.stringify(normalizedUsers)
    lastUsersJsonRef.current = usersJson
    localStorage.setItem(STORAGE_KEYS.users, usersJson)
    setUsers(normalizedUsers)
    setCurrentUser((me) => {
      if (!me) return me
      return normalizedUsers.find((user) => user.id === me.id) || null
    })
    return normalizedUsers
  }, [])

  const applyMenuList = useCallback((nextMenu) => {
    const normalizedMenu = normalizeMenu(nextMenu)
    lastMenuJsonRef.current = JSON.stringify(normalizedMenu)
    saveStorage(STORAGE_KEYS.menu, normalizedMenu)
    setMenu(normalizedMenu)
    return normalizedMenu
  }, [])

  const applyRequestsList = useCallback((nextRequests) => {
    const normalizedRequests = Array.isArray(nextRequests) ? nextRequests : []
    lastRequestsJsonRef.current = JSON.stringify(normalizedRequests)
    saveStorage(STORAGE_KEYS.requests, normalizedRequests)
    setRequests(normalizedRequests)
    return normalizedRequests
  }, [])

  const applyOrdersList = useCallback((nextOrders) => {
    const normalizedOrders = normalizeOrders(nextOrders)
    const ordersJson = JSON.stringify(normalizedOrders)
    lastOrdersJsonRef.current = ordersJson
    localStorage.setItem(STORAGE_KEYS.orders, ordersJson)
    setOrdersRefreshError('')
    setOrders(normalizedOrders)
    return normalizedOrders
  }, [])

  const applyServerState = useCallback(
    (state) => {
      if (!state) return null
      return {
        users: applyUsersList(state.users),
        menu: applyMenuList(state.menu),
        requests: applyRequestsList(state.requests),
        orders: applyOrdersList(state.orders),
      }
    },
    [applyMenuList, applyOrdersList, applyRequestsList, applyUsersList],
  )

  const refreshServerState = useCallback(async () => {
    try {
      return applyServerState(await fetchServerState())
    } catch {
      return null
    }
  }, [applyServerState])

  const commitUsers = useCallback(
    async (nextUsers) => {
      const normalizedUsers = applyUsersList(nextUsers)
      usersSyncChannelRef.current?.postMessage(JSON.stringify(normalizedUsers))
      try {
        applyServerState(await saveServerCollection('users', normalizedUsers))
      } catch {
        /* local fallback keeps the current browser usable */
      }
      return normalizedUsers
    },
    [applyServerState, applyUsersList],
  )

  const getLatestUsers = useCallback(async () => {
    const serverState = await refreshServerState()
    if (serverState?.users) return serverState.users
    const storedUsers = localStorage.getItem(STORAGE_KEYS.users)
    if (storedUsers == null || storedUsers === '') return users
    return parseStoredUsers(storedUsers) || users
  }, [refreshServerState, users])

  const applyUsersJson = useCallback(
    (usersJson) => {
      const nextUsers = usersJson == null || usersJson === '' ? starterUsers : parseStoredUsers(usersJson)
      if (!nextUsers) return false
      if (JSON.stringify(nextUsers) === lastUsersJsonRef.current) return true
      applyUsersList(nextUsers)
      return true
    },
    [applyUsersList],
  )

  const refreshUsersFromStorage = useCallback(() => {
    applyUsersJson(localStorage.getItem(STORAGE_KEYS.users))
  }, [applyUsersJson])

  const commitMenu = useCallback(
    async (nextMenu) => {
      const normalizedMenu = applyMenuList(nextMenu)
      try {
        applyServerState(await saveServerCollection('menu', normalizedMenu))
      } catch {
        /* local fallback keeps the current browser usable */
      }
      return normalizedMenu
    },
    [applyMenuList, applyServerState],
  )

  const getLatestMenu = useCallback(async () => {
    const serverState = await refreshServerState()
    if (serverState?.menu) return serverState.menu
    return normalizeMenu(readStorage(STORAGE_KEYS.menu, menu))
  }, [menu, refreshServerState])

  const commitRequests = useCallback(
    async (nextRequests) => {
      const normalizedRequests = applyRequestsList(nextRequests)
      try {
        applyServerState(await saveServerCollection('requests', normalizedRequests))
      } catch {
        /* local fallback keeps the current browser usable */
      }
      return normalizedRequests
    },
    [applyRequestsList, applyServerState],
  )

  const getLatestRequests = useCallback(async () => {
    const serverState = await refreshServerState()
    if (serverState?.requests) return serverState.requests
    return readStorage(STORAGE_KEYS.requests, requests)
  }, [refreshServerState, requests])

  const commitOrders = useCallback(
    async (nextOrders) => {
      const normalizedOrders = applyOrdersList(nextOrders)
      ordersSyncChannelRef.current?.postMessage(JSON.stringify(normalizedOrders))
      try {
        applyServerState(await saveServerCollection('orders', normalizedOrders))
      } catch {
        /* local fallback keeps the current browser usable */
      }
      return normalizedOrders
    },
    [applyOrdersList, applyServerState],
  )

  const getLatestOrders = useCallback(async () => {
    const serverState = await refreshServerState()
    if (Array.isArray(serverState?.orders)) return serverState.orders
    const storedOrders = localStorage.getItem(STORAGE_KEYS.orders)
    if (storedOrders == null || storedOrders === '') return orders
    return parseStoredOrders(storedOrders) || orders
  }, [orders, refreshServerState])

  const applyOrdersJson = useCallback((ordersJson) => {
    if (ordersJson == null || ordersJson === '') {
      return true
    }

    const nextOrders = parseStoredOrders(ordersJson)
    if (!nextOrders) {
      setOrdersRefreshError('Could not refresh the queue. The saved order data is invalid.')
      return false
    }

    const nextOrdersJson = JSON.stringify(nextOrders)
    setOrdersRefreshError('')
    if (nextOrdersJson === lastOrdersJsonRef.current) return true

    applyOrdersList(nextOrders)
    return true
  }, [applyOrdersList])

  const refreshOrdersFromStorage = useCallback(() => {
    applyOrdersJson(localStorage.getItem(STORAGE_KEYS.orders))
  }, [applyOrdersJson])

  const refreshOrdersFromServer = useCallback(async () => {
    const serverState = await refreshServerState()
    if (serverState?.orders) return true
    refreshOrdersFromStorage()
    return false
  }, [refreshOrdersFromStorage, refreshServerState])

  const refreshUsersFromServer = useCallback(async () => {
    const serverState = await refreshServerState()
    if (serverState?.users) return true
    refreshUsersFromStorage()
    return false
  }, [refreshServerState, refreshUsersFromStorage])

  useEffect(() => {
    saveStorage(STORAGE_KEYS.menu, menu)
  }, [menu])

  /** Keep kitchen queue in sync when another tab (e.g. teacher) places or edits orders. */
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key !== STORAGE_KEYS.orders) return
      applyOrdersJson(e.newValue)
    }

    let channel
    if ('BroadcastChannel' in window) {
      channel = new BroadcastChannel(ORDER_SYNC_CHANNEL)
      ordersSyncChannelRef.current = channel
      channel.onmessage = (event) => {
        if (typeof event.data === 'string') applyOrdersJson(event.data)
      }
    }

    window.addEventListener('storage', onStorage)
    window.addEventListener('focus', refreshOrdersFromServer)
    document.addEventListener('visibilitychange', refreshOrdersFromServer)
    refreshOrdersFromServer()

    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('focus', refreshOrdersFromServer)
      document.removeEventListener('visibilitychange', refreshOrdersFromServer)
      channel?.close()
      if (ordersSyncChannelRef.current === channel) ordersSyncChannelRef.current = null
    }
  }, [applyOrdersJson, refreshOrdersFromServer])

  useEffect(() => {
    if (!isBistroStaff || activePage !== 'orders') return
    refreshOrdersFromServer()
    const refreshId = window.setInterval(refreshOrdersFromServer, 2000)
    return () => window.clearInterval(refreshId)
  }, [activePage, isBistroStaff, refreshOrdersFromServer])

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key !== STORAGE_KEYS.users) return
      applyUsersJson(e.newValue)
    }

    let channel
    if ('BroadcastChannel' in window) {
      channel = new BroadcastChannel(USER_SYNC_CHANNEL)
      usersSyncChannelRef.current = channel
      channel.onmessage = (event) => {
        if (typeof event.data === 'string') applyUsersJson(event.data)
      }
    }

    window.addEventListener('storage', onStorage)
    window.addEventListener('focus', refreshUsersFromServer)
    document.addEventListener('visibilitychange', refreshUsersFromServer)
    refreshUsersFromServer()

    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('focus', refreshUsersFromServer)
      document.removeEventListener('visibilitychange', refreshUsersFromServer)
      channel?.close()
      if (usersSyncChannelRef.current === channel) usersSyncChannelRef.current = null
    }
  }, [applyUsersJson, refreshUsersFromServer])

  useEffect(() => {
    if (!isBistroAdmin || activePage !== 'management') return
    refreshUsersFromServer()
    const refreshId = window.setInterval(refreshUsersFromServer, 2000)
    return () => window.clearInterval(refreshId)
  }, [activePage, isBistroAdmin, refreshUsersFromServer])

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 769px)')
    const fn = () => setIsDesktop(mq.matches)
    mq.addEventListener('change', fn)
    return () => mq.removeEventListener('change', fn)
  }, [])

  useEffect(() => {
    if (!isTeacher || !isDesktop || activePage !== 'orders') return
    setOrdersPopoutOpen(true)
    setActivePage('home')
  }, [isTeacher, isDesktop, activePage])

  useEffect(() => {
    if (!currentUser || !isDesktop || activePage !== 'account') return
    setAccountPopoutOpen(true)
    setActivePage('home')
  }, [currentUser, isDesktop, activePage])

  useEffect(() => {
    if (!currentUser) {
      setAccountForm({ name: '', email: '', password: '' })
      return
    }
    setAccountForm({ name: currentUser.name, email: currentUser.email, password: '' })
  }, [currentUser])

  /** Restore login after refresh / revisit */
  useEffect(() => {
    let alive = true

    const restoreSession = async () => {
      const session = readStorage(STORAGE_KEYS.session, null)
      if (!session?.userId) return
      const allUsers = await getLatestUsers()
      const u = allUsers.find((user) => user.id === session.userId)
      if (alive && u) setCurrentUser(u)
    }

    restoreSession()
    return () => {
      alive = false
    }
  }, [getLatestUsers])

  useEffect(() => {
    const onDocClick = (e) => {
      const t = e.target
      if (
        cartPopoutOpen &&
        !cartPanelRef.current?.contains(t) &&
        !cartSidebarBtnRef.current?.contains(t)
      ) {
        setCartPopoutOpen(false)
      }
      if (
        ordersPopoutOpen &&
        !ordersPanelRef.current?.contains(t) &&
        !ordersSidebarBtnRef.current?.contains(t)
      ) {
        setOrdersPopoutOpen(false)
      }
      if (
        accountPopoutOpen &&
        !accountPanelRef.current?.contains(t) &&
        !accountSidebarBtnRef.current?.contains(t)
      ) {
        setAccountPopoutOpen(false)
      }
    }
    if (!cartPopoutOpen && !ordersPopoutOpen && !accountPopoutOpen) return undefined
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [accountPopoutOpen, cartPopoutOpen, ordersPopoutOpen])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setCartPopoutOpen(false)
        setOrdersPopoutOpen(false)
        setAccountPopoutOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const handleAuthSubmit = async (event) => {
    event.preventDefault()
    const email = authForm.email.trim().toLowerCase()
    const password = authForm.password.trim()
    const name = authForm.name.trim()
    const latestUsers = await getLatestUsers()

    if (!email || !password) {
      alert('Email and password are required.')
      return
    }

    if (authMode === 'signup') {
      if (!name) {
        alert('Please enter your name.')
        return
      }

      const userExists = latestUsers.some((user) => user.email === email)
      if (userExists) {
        alert('An account with this email already exists.')
        return
      }

      const createdUser = {
        id: Date.now(),
        name,
        email,
        password,
        role: 'teacher',
      }
      await commitUsers([...latestUsers, createdUser])
      setCurrentUser(createdUser)
      saveStorage(STORAGE_KEYS.session, { userId: createdUser.id })
      setActivePage('home')
    } else {
      const matchingUser = latestUsers.find(
        (user) =>
          user.email === email && user.password === password && user.role === activeRole,
      )
      if (!matchingUser) {
        alert('Login failed. Check the account type and your credentials.')
        return
      }
      setCurrentUser(matchingUser)
      saveStorage(STORAGE_KEYS.session, { userId: matchingUser.id })
      setActivePage('home')
    }

    setAuthForm({ name: '', email: '', password: '' })
  }

  const addFoodItem = async (event) => {
    event.preventDefault()
    const name = foodForm.name.trim()
    const category = foodForm.category.trim()
    const price = Number(foodForm.price)

    if (!name || !category || Number.isNaN(price) || price <= 0) {
      alert('Please fill in a valid name, category, and price.')
      return
    }

    const newItem = {
      id: Date.now(),
      name,
      category,
      price: Number(price.toFixed(2)),
      addedAt: Date.now(),
    }
    await commitMenu([...(await getLatestMenu()), newItem])
    setFoodForm({ name: '', category: '', price: '' })
  }

  const removeFoodItem = async (id) => {
    await commitMenu((await getLatestMenu()).filter((item) => item.id !== id))
  }

  const addToCart = (item) => {
    const lines = [...teacherCart]
    const idx = lines.findIndex((l) => l.menuItemId === item.id)
    if (idx >= 0) {
      lines[idx] = { ...lines[idx], qty: lines[idx].qty + 1 }
    } else {
      lines.push({
        lineId: Date.now(),
        menuItemId: item.id,
        name: item.name,
        price: item.price,
        qty: 1,
      })
    }
    setTeacherCart(lines)
  }

  const updateLineQty = (lineId, delta) => {
    setTeacherCart(
      teacherCart
        .map((line) =>
          line.lineId === lineId ? { ...line, qty: line.qty + delta } : line,
        )
        .filter((line) => line.qty > 0),
    )
  }

  const removeLine = (lineId) => {
    setTeacherCart(teacherCart.filter((l) => l.lineId !== lineId))
  }

  const checkoutCart = async () => {
    if (teacherCart.length === 0) return
    const now = new Date().toLocaleString()
    const baseId = Date.now()
    const newOrders = teacherCart.flatMap((line, lineIdx) =>
      Array.from({ length: line.qty }, (_, i) => ({
        id: `ord-${baseId}-${lineIdx}-${i}-${Math.random().toString(36).slice(2, 9)}`,
        sortKey: baseId + lineIdx * 100 + i,
        itemName: line.name,
        price: line.price,
        teacherEmail: currentUser.email,
        teacherName: currentUser.name,
        createdAt: now,
        status: 'ordered',
      })),
    )
    await commitOrders([...(await getLatestOrders()), ...newOrders])
    setTeacherCart([])
    setCartPopoutOpen(false)
    if (isDesktop) {
      setOrdersPopoutOpen(true)
      setActivePage('home')
    } else {
      setActivePage('orders')
    }
  }

  const updateOrderStatus = async (orderId, status) => {
    if (!ORDER_STATUS_KITCHEN.includes(status)) return
    await commitOrders((await getLatestOrders()).map((o) => (sameOrderId(o.id, orderId) ? { ...o, status } : o)))
  }

  const bistroDeleteOrder = async (orderId) => {
    await commitOrders((await getLatestOrders()).filter((o) => !sameOrderId(o.id, orderId)))
  }

  const teacherCancelOrder = async (orderId) => {
    await commitOrders(
      (await getLatestOrders()).map((o) => {
        if (!sameOrderId(o.id, orderId) || o.teacherEmail !== currentUser.email) return o
        if (o.status !== 'ordered' && o.status !== 'preparing') return o
        return { ...o, status: CANCELLED_STATUS }
      }),
    )
  }

  const teacherRemoveOrder = async (orderId) => {
    await commitOrders(
      (await getLatestOrders()).filter(
        (o) => !(sameOrderId(o.id, orderId) && o.teacherEmail === currentUser.email),
      ),
    )
  }

  const teacherClearHistory = async () => {
    await commitOrders(
      (await getLatestOrders()).filter(
        (o) =>
          o.teacherEmail !== currentUser.email ||
          (o.status !== 'ready' && o.status !== CANCELLED_STATUS),
      ),
    )
  }

  const adminCreateBistro = async (e) => {
    e.preventDefault()
    const name = mgmtBistro.name.trim()
    const email = mgmtBistro.email.trim().toLowerCase()
    const password = mgmtBistro.password.trim()
    const latestUsers = await getLatestUsers()
    if (!name || !email || !password) {
      alert('Name, email, and password are required.')
      return
    }
    if (latestUsers.some((u) => u.email === email)) {
      alert('That email is already in use.')
      return
    }
    const newUser = {
      id: Date.now(),
      name,
      email,
      password,
      role: 'bistro',
    }
    await commitUsers([...latestUsers, newUser])
    setMgmtBistro({ name: '', email: '', password: '' })
  }

  const adminCreateTeacher = async (e) => {
    e.preventDefault()
    const name = mgmtTeacher.name.trim()
    const email = mgmtTeacher.email.trim().toLowerCase()
    const password = mgmtTeacher.password.trim()
    const latestUsers = await getLatestUsers()
    if (!name || !email || !password) {
      alert('Name, email, and password are required.')
      return
    }
    if (latestUsers.some((u) => u.email === email)) {
      alert('That email is already in use.')
      return
    }
    const newUser = {
      id: Date.now(),
      name,
      email,
      password,
      role: 'teacher',
    }
    await commitUsers([...latestUsers, newUser])
    setMgmtTeacher({ name: '', email: '', password: '' })
  }

  const adminDeleteUser = async (userId) => {
    const latestUsers = await getLatestUsers()
    const target = latestUsers.find((u) => u.id === userId)
    if (!target) return
    if (target.id === 1) {
      alert('The main admin account cannot be deleted.')
      return
    }
    if (target.role === 'bistro_admin') {
      alert('Admin accounts cannot be deleted here.')
      return
    }
    if (target.id === currentUser.id) {
      alert('Sign out first if you want to remove your own session; you cannot delete yourself while logged in.')
      return
    }
    if (!window.confirm(`Delete account ${target.email}? This cannot be undone.`)) return
    await commitUsers(latestUsers.filter((x) => x.id !== userId))
    if (editingUserId === userId) {
      setEditingUserId(null)
      setEditForm({ name: '', email: '', password: '' })
    }
  }

  const adminStartEdit = (u) => {
    setEditingUserId(u.id)
    setEditForm({ name: u.name, email: u.email, password: '' })
  }

  const adminSaveEdit = async (e) => {
    e.preventDefault()
    if (!editingUserId) return
    const name = editForm.name.trim()
    const email = editForm.email.trim().toLowerCase()
    const password = editForm.password.trim()
    const latestUsers = await getLatestUsers()
    if (!name || !email) {
      alert('Name and email are required.')
      return
    }
    if (latestUsers.some((u) => u.email === email && u.id !== editingUserId)) {
      alert('Another account already uses that email.')
      return
    }
    const updatedUsers = await commitUsers(
      latestUsers.map((u) => {
        if (u.id !== editingUserId) return u
        const next = { ...u, name, email }
        if (password) next.password = password
        return next
      }),
    )
    setCurrentUser((me) =>
      me && me.id === editingUserId
        ? updatedUsers.find((u) => u.id === editingUserId) || me
        : me,
    )
    setEditingUserId(null)
    setEditForm({ name: '', email: '', password: '' })
  }

  const saveOwnAccount = async (event) => {
    event.preventDefault()
    if (!currentUser) return

    const name = accountForm.name.trim()
    const email = accountForm.email.trim().toLowerCase()
    const password = accountForm.password.trim()
    if (!name || !email) {
      alert('Name and email are required.')
      return
    }

    const latestUsers = await getLatestUsers()
    if (latestUsers.some((u) => u.email === email && u.id !== currentUser.id)) {
      alert('Another account already uses that email.')
      return
    }

    const previousEmail = currentUser.email
    const updatedUsers = await commitUsers(
      latestUsers.map((u) => {
        if (u.id !== currentUser.id) return u
        const next = { ...u, name, email }
        if (password) next.password = password
        return next
      }),
    )
    const updatedUser = updatedUsers.find((u) => u.id === currentUser.id)
    if (updatedUser) {
      setCurrentUser(updatedUser)
      saveStorage(STORAGE_KEYS.session, { userId: updatedUser.id })
    }

    if (currentUser.role === 'teacher') {
      if (previousEmail !== email) {
        setCartsByEmail((prev) => {
          const next = { ...prev }
          const previousCart = next[previousEmail] || []
          const existingCart = next[email] || []
          next[email] = [...existingCart, ...previousCart]
          delete next[previousEmail]
          saveStorage(STORAGE_KEYS.carts, next)
          return next
        })
      }

      await commitOrders(
        (await getLatestOrders()).map((order) =>
          order.teacherEmail === previousEmail
            ? { ...order, teacherEmail: email, teacherName: name }
            : order,
        ),
      )
    }

    setAccountForm({ name, email, password: '' })
    alert('Account updated.')
  }

  const submitRequest = async (event) => {
    event.preventDefault()
    const text = requestText.trim()
    if (!text) {
      return
    }

    const newRequest = {
      id: Date.now(),
      message: text,
      teacherEmail: currentUser.email,
      createdAt: new Date().toLocaleString(),
    }
    await commitRequests([...(await getLatestRequests()), newRequest])
    setRequestText('')
  }

  const signOut = () => {
    setCurrentUser(null)
    setAuthMode('login')
    setActiveRole('teacher')
    setActivePage('home')
    setCartPopoutOpen(false)
    setOrdersPopoutOpen(false)
    setAccountPopoutOpen(false)
    setEditingUserId(null)
    setEditForm({ name: '', email: '', password: '' })
    setMgmtBistro({ name: '', email: '', password: '' })
    setMgmtTeacher({ name: '', email: '', password: '' })
    localStorage.removeItem(STORAGE_KEYS.session)
  }

  const goNav = (page) => {
    setActivePage(page)
    setCartPopoutOpen(false)
    setOrdersPopoutOpen(false)
    setAccountPopoutOpen(false)
    if (page === 'orders') refreshOrdersFromServer()
  }

  const orderStatusLabel = (value) => {
    if (value === CANCELLED_STATUS) return 'Cancelled'
    return ORDER_STATUSES.find((s) => s.value === value)?.label ?? value
  }

  const renderCartContents = ({ showClose }) => (
    <>
      <div className="cart-dropdown-head">
        <h3>Your cart</h3>
        {showClose && (
          <button type="button" className="btn-text" onClick={() => setCartPopoutOpen(false)}>
            Close
          </button>
        )}
      </div>
      {teacherCart.length === 0 ? (
        <p className="muted cart-empty">Your cart is empty. Add items from the menu.</p>
      ) : (
        <>
          <ul className="cart-lines">
            {teacherCart.map((line) => (
              <li key={line.lineId} className="cart-line">
                <div className="cart-line-info">
                  <strong>{line.name}</strong>
                  <span>${line.price.toFixed(2)} each</span>
                </div>
                <div className="cart-line-actions">
                  <button type="button" onClick={() => updateLineQty(line.lineId, -1)} aria-label="Decrease">
                    −
                  </button>
                  <span>{line.qty}</span>
                  <button type="button" onClick={() => updateLineQty(line.lineId, 1)} aria-label="Increase">
                    +
                  </button>
                  <button type="button" className="btn-text remove" onClick={() => removeLine(line.lineId)}>
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <div className="cart-footer">
            <div className="cart-total-row">
              <span>Total</span>
              <strong>${cartTotal.toFixed(2)}</strong>
            </div>
            <button type="button" className="btn-primary btn-wide glow" onClick={checkoutCart}>
              Place order
            </button>
          </div>
        </>
      )}
    </>
  )

  const renderCartMobilePage = () => (
    <div className="page page-enter cart-page-mobile">
      <div className="glass-card section-card cart-page-card">
        <div className="cart-dropdown-head cart-page-head">
          <h3>Your cart</h3>
        </div>
        {teacherCart.length === 0 ? (
          <p className="muted cart-empty">Your cart is empty. Add items from the menu.</p>
        ) : (
          <>
            <ul className="cart-lines cart-lines-page">
              {teacherCart.map((line) => (
                <li key={line.lineId} className="cart-line">
                  <div className="cart-line-info">
                    <strong>{line.name}</strong>
                    <span>${line.price.toFixed(2)} each</span>
                  </div>
                  <div className="cart-line-actions">
                    <button type="button" onClick={() => updateLineQty(line.lineId, -1)} aria-label="Decrease">
                      −
                    </button>
                    <span>{line.qty}</span>
                    <button type="button" onClick={() => updateLineQty(line.lineId, 1)} aria-label="Increase">
                      +
                    </button>
                    <button type="button" className="btn-text remove" onClick={() => removeLine(line.lineId)}>
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            <div className="cart-footer">
              <div className="cart-total-row">
                <span>Total</span>
                <strong>${cartTotal.toFixed(2)}</strong>
              </div>
              <button type="button" className="btn-primary btn-wide glow" onClick={checkoutCart}>
                Place order
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )

  const renderOrdersGuest = () => (
    <div className="page page-enter menu-locked">
      <div className="glass-card lock-card">
        <h2>Orders</h2>
        <p>Sign in to see the status of your lunch orders.</p>
        <button type="button" className="btn-primary glow" onClick={() => goNav('account')}>
          Go to account
        </button>
      </div>
    </div>
  )

  const renderOrdersTeacherInner = ({ showClose }) => {
    const mine = [...totalTeacherOrders].sort((a, b) => orderSortKey(b) - orderSortKey(a))
    const canClearHistory = mine.some(
      (o) => o.status === 'ready' || o.status === CANCELLED_STATUS,
    )
    return (
      <>
        <div className="cart-dropdown-head">
          <h3>Your orders</h3>
          {showClose && (
            <button type="button" className="btn-text" onClick={() => setOrdersPopoutOpen(false)}>
              Close
            </button>
          )}
        </div>
        <p className="section-sub orders-sub">
          Each line is one item from the bistro. Cancel while it is still being prepared, or remove
          finished and cancelled orders from your list. Use clear history to tidy multiple completed
          orders at once.
        </p>
        {mine.length === 0 ? (
          <p className="muted cart-empty">No orders yet. Add items from the menu and check out your cart.</p>
        ) : (
          <>
            <ul className="orders-list orders-list-teacher">
              {mine.map((order, i) => (
                <li
                  key={order.id}
                  className="order-row order-row-teacher"
                  style={{ animationDelay: `${0.04 * Math.min(i, 16)}s` }}
                >
                  <div className="order-row-top">
                    <div className="order-row-main">
                      <strong>{order.itemName}</strong>
                      <span className="muted small">
                        ${order.price.toFixed(2)} · {order.createdAt}
                      </span>
                    </div>
                    <span className={`status-pill status-${order.status}`}>
                      {orderStatusLabel(order.status)}
                    </span>
                  </div>
                  <div className="order-teacher-actions">
                    {(order.status === 'ordered' || order.status === 'preparing') && (
                      <button
                        type="button"
                        className="btn-ghost btn-sm"
                        onClick={() => teacherCancelOrder(order.id)}
                      >
                        Cancel order
                      </button>
                    )}
                    {(order.status === 'ready' || order.status === CANCELLED_STATUS) && (
                      <button
                        type="button"
                        className="btn-text remove"
                        onClick={() => teacherRemoveOrder(order.id)}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            {canClearHistory && (
              <button type="button" className="btn-ghost btn-wide btn-clear-history" onClick={teacherClearHistory}>
                Clear completed &amp; cancelled
              </button>
            )}
          </>
        )}
      </>
    )
  }

  const renderOrdersTeacherMobilePage = () => (
    <div className="page page-enter cart-page-mobile">
      <div className="glass-card section-card cart-page-card">
        {renderOrdersTeacherInner({ showClose: false })}
      </div>
    </div>
  )

  const renderOrdersBistro = () => {
    const sorted = [...orders].sort((a, b) => orderSortKey(b) - orderSortKey(a))
    return (
      <div className="page page-enter">
        <div className="glass-card section-card">
          <div className="section-head queue-head">
            <h3 className="section-title">Kitchen queue</h3>
            <button type="button" className="btn-ghost btn-sm" onClick={refreshOrdersFromServer}>
              Refresh
            </button>
          </div>
          <p className="section-sub">Update status for each teacher order</p>
          {ordersRefreshError && (
            <p className="refresh-error" role="alert">
              {ordersRefreshError}
            </p>
          )}
          {sorted.length === 0 ? (
            <p className="muted">No orders yet.</p>
          ) : (
            <ul className="orders-list orders-list-bistro">
              {sorted.map((order, i) => (
                <li
                  key={order.id}
                  className="order-row order-row-bistro"
                  style={{ animationDelay: `${0.03 * Math.min(i, 20)}s` }}
                >
                  <div className="order-row-bistro-inner">
                    <div className="order-row-main">
                      <strong>{order.itemName}</strong>
                      <span className="muted small">
                        {order.teacherName || order.teacherEmail} · ${order.price.toFixed(2)} ·{' '}
                        {order.createdAt}
                      </span>
                    </div>
                    <div className="order-bistro-controls">
                      {order.status === CANCELLED_STATUS ? (
                        <span className={`status-pill status-${CANCELLED_STATUS}`}>Cancelled</span>
                      ) : (
                        <label className="status-select-wrap">
                          <span className="sr-only">Status for order {order.id}</span>
                          <select
                            className="status-select glass-select"
                            value={order.status}
                            onChange={(e) => updateOrderStatus(order.id, e.target.value)}
                          >
                            {ORDER_STATUSES.map((s) => (
                              <option key={s.value} value={s.value}>
                                {s.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                      {order.status === 'ready' && (
                        <button
                          type="button"
                          className="btn-danger btn-sm"
                          onClick={() => bistroDeleteOrder(order.id)}
                        >
                          Remove from queue
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    )
  }

  const renderManagement = () => {
    const bistroStaff = users.filter((u) => u.role === 'bistro')
    const teachers = users.filter((u) => u.role === 'teacher')
    return (
      <div className="page page-enter">
        <div className="glass-card section-card">
          <h3 className="section-title">Bistro staff accounts</h3>
          <p className="section-sub">Create logins for lunch staff. They use “Bistro staff” on the login screen.</p>
          <form onSubmit={adminCreateBistro} className="form-grid mgmt-form">
            <input
              placeholder="Display name"
              value={mgmtBistro.name}
              onChange={(e) => setMgmtBistro({ ...mgmtBistro, name: e.target.value })}
            />
            <input
              type="email"
              placeholder="Email"
              value={mgmtBistro.email}
              onChange={(e) => setMgmtBistro({ ...mgmtBistro, email: e.target.value })}
            />
            <input
              type="password"
              placeholder="Password"
              value={mgmtBistro.password}
              onChange={(e) => setMgmtBistro({ ...mgmtBistro, password: e.target.value })}
            />
            <button type="submit" className="btn-primary">
              Add bistro account
            </button>
          </form>
          <ul className="mgmt-user-list">
            {bistroStaff.map((u) => (
              <li key={u.id} className="mgmt-user-row">
                <div>
                  <strong>{u.name}</strong>
                  <span className="muted small">{u.email}</span>
                </div>
                <div className="mgmt-user-actions">
                  <button type="button" className="btn-ghost btn-sm" onClick={() => adminStartEdit(u)}>
                    Edit
                  </button>
                  <button type="button" className="btn-danger btn-sm" onClick={() => adminDeleteUser(u.id)}>
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="glass-card section-card">
          <h3 className="section-title">Teacher accounts</h3>
          <p className="section-sub">Teachers can still sign up themselves; you can also add or fix accounts here.</p>
          <form onSubmit={adminCreateTeacher} className="form-grid mgmt-form">
            <input
              placeholder="Full name"
              value={mgmtTeacher.name}
              onChange={(e) => setMgmtTeacher({ ...mgmtTeacher, name: e.target.value })}
            />
            <input
              type="email"
              placeholder="Email"
              value={mgmtTeacher.email}
              onChange={(e) => setMgmtTeacher({ ...mgmtTeacher, email: e.target.value })}
            />
            <input
              type="password"
              placeholder="Password"
              value={mgmtTeacher.password}
              onChange={(e) => setMgmtTeacher({ ...mgmtTeacher, password: e.target.value })}
            />
            <button type="submit" className="btn-primary">
              Add teacher account
            </button>
          </form>
          <ul className="mgmt-user-list">
            {teachers.map((u) => (
              <li key={u.id} className="mgmt-user-row">
                <div>
                  <strong>{u.name}</strong>
                  <span className="muted small">{u.email}</span>
                </div>
                <div className="mgmt-user-actions">
                  <button type="button" className="btn-ghost btn-sm" onClick={() => adminStartEdit(u)}>
                    Edit
                  </button>
                  <button type="button" className="btn-danger btn-sm" onClick={() => adminDeleteUser(u.id)}>
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {editingUserId && (
          <div className="glass-card section-card mgmt-edit-card">
            <h3 className="section-title">Edit account</h3>
            <form onSubmit={adminSaveEdit} className="form-grid">
              <input
                placeholder="Name"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              />
              <input
                type="email"
                placeholder="Email"
                value={editForm.email}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
              />
              <input
                type="password"
                placeholder="New password (leave blank to keep current)"
                value={editForm.password}
                onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
              />
              <div className="mgmt-edit-actions">
                <button type="submit" className="btn-primary">
                  Save
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => {
                    setEditingUserId(null)
                    setEditForm({ name: '', email: '', password: '' })
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    )
  }

  const renderHome = () => (
    <div className="page page-enter">
      <div className="glass-card hero-card">
        <p className="eyebrow">School Bistro</p>
        <h2 className="hero-title">Lunch for teachers, managed by your bistro</h2>
        <p className="hero-copy">
          Browse the daily menu, build your cart, and send requests for future meals. Bistro staff
          can update offerings anytime so everyone stays in sync.
        </p>
      </div>

      <section className="glass-card section-card">
        <h3 className="section-title">Just added</h3>
        <p className="section-sub">The three newest items on the menu</p>
        <ul className="featured-grid">
          {threeNewestItems.map((item, i) => (
            <li
              key={item.id}
              className="featured-item"
              style={{ animationDelay: `${0.08 * i}s` }}
            >
              <div className="featured-thumb" aria-hidden />
              <div className="featured-meta">
                <strong>{item.name}</strong>
                <span>{item.category}</span>
                <span className="featured-price">${item.price.toFixed(2)}</span>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {isTeacher && (
        <section className="glass-card section-card home-request-card">
          <h3 className="section-title">Request something for a future menu</h3>
          <p className="section-sub home-request-lead">
            Have an idea for allergy-friendly options, theme days, or a dish you would love to see
            again? Send it here. The bistro team reads every note when they plan upcoming menus—no
            promises, but your feedback goes straight into their planning.
          </p>
          <form onSubmit={submitRequest} className="form-grid">
            <textarea
              rows="4"
              placeholder="Example: more vegetarian mains on Tuesdays, or bring back the turkey cranberry wrap."
              value={requestText}
              onChange={(e) => setRequestText(e.target.value)}
            />
            <button type="submit" className="btn-primary">
              Send request
            </button>
          </form>
        </section>
      )}

      {isBistroStaff && (
        <section className="glass-card section-card bistro-dash">
          <h3 className="section-title">Bistro snapshot</h3>
          <div className="stat-row">
            <div className="stat">
              <span className="stat-value">{menu.length}</span>
              <span className="stat-label">Menu items</span>
            </div>
            <div className="stat">
              <span className="stat-value">{requests.length}</span>
              <span className="stat-label">Teacher requests</span>
            </div>
          </div>
        </section>
      )}
    </div>
  )

  const renderMenuLocked = () => (
    <div className="page page-enter menu-locked">
      <div className="glass-card lock-card">
        <div className="lock-icon" aria-hidden />
        <h2>Full menu</h2>
        <p>
          Create a free teacher account to see every dish, add items to your cart, and place orders.
        </p>
        <button type="button" className="btn-primary glow" onClick={() => goNav('account')}>
          Go to account
        </button>
      </div>
    </div>
  )

  const renderMenuFull = () => (
    <div className="page page-enter">
      <div className="glass-card section-card">
        <h3 className="section-title">Full menu</h3>
        <p className="section-sub">Tap add to put items in your cart</p>
        <ul className="menu-grid">
          {menu.map((item, i) => (
            <li
              key={item.id}
              className="menu-tile"
              style={{ animationDelay: `${0.04 * Math.min(i, 12)}s` }}
            >
              <div className="menu-tile-top">
                <div className="menu-thumb" aria-hidden />
                <div>
                  <strong>{item.name}</strong>
                  <span className="menu-cat">{item.category}</span>
                </div>
              </div>
              <div className="menu-tile-bottom">
                <span className="menu-price">${item.price.toFixed(2)}</span>
                <button type="button" className="btn-ghost" onClick={() => addToCart(item)}>
                  Add to cart
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )

  const renderMenuBistro = () => (
    <div className="page page-enter">
      <div className="glass-card section-card">
        <h3 className="section-title">Manage menu</h3>
        <form onSubmit={addFoodItem} className="form-grid glass-inner">
          <input
            type="text"
            placeholder="Food name"
            value={foodForm.name}
            onChange={(e) => setFoodForm({ ...foodForm, name: e.target.value })}
          />
          <input
            type="text"
            placeholder="Category"
            value={foodForm.category}
            onChange={(e) => setFoodForm({ ...foodForm, category: e.target.value })}
          />
          <input
            type="number"
            min="0.1"
            step="0.01"
            placeholder="Price"
            value={foodForm.price}
            onChange={(e) => setFoodForm({ ...foodForm, price: e.target.value })}
          />
          <button type="submit" className="btn-primary">
            Add item
          </button>
        </form>
        <ul className="list glass-list">
          {menu.map((item) => (
            <li key={item.id}>
              <div>
                <strong>{item.name}</strong>
                <span>
                  {item.category} · ${item.price.toFixed(2)}
                </span>
              </div>
              <button type="button" className="btn-danger" onClick={() => removeFoodItem(item.id)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="glass-card section-card">
        <h3 className="section-title">Teacher requests</h3>
        <ul className="list glass-list compact">
          {requests.length === 0 && <li className="muted">No requests yet.</li>}
          {requests.map((request) => (
            <li key={request.id}>
              <div>
                <strong>{request.teacherEmail}</strong>
                <span>{request.message}</span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )

  const renderAccountGuest = () => (
    <div className="page page-enter auth-page">
      <div className="auth-visual glass-card">
        <div className="auth-blob" />
        <h2>Welcome back</h2>
        <p className="auth-lead">
          Sign in to unlock the full menu, cart, and ordering. New here? Create a teacher account in
          seconds.
        </p>
        <ul className="auth-bullets">
          <li>Full daily menu</li>
          <li>Cart & checkout</li>
          <li>Future menu requests</li>
        </ul>
      </div>

      <div className={`auth-panel glass-card ${authMode === 'signup' ? 'mode-signup' : 'mode-login'}`}>
        <div className="auth-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={authMode === 'login'}
            className={authMode === 'login' ? 'active' : ''}
            onClick={() => setAuthMode('login')}
          >
            Login
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={authMode === 'signup'}
            className={authMode === 'signup' ? 'active' : ''}
            onClick={() => setAuthMode('signup')}
          >
            Sign up
          </button>
        </div>

        {authMode === 'login' && (
          <div className="role-pills role-pills-three">
            <button
              type="button"
              className={activeRole === 'teacher' ? 'pill active' : 'pill'}
              onClick={() => setActiveRole('teacher')}
            >
              Teacher
            </button>
            <button
              type="button"
              className={activeRole === 'bistro' ? 'pill active' : 'pill'}
              onClick={() => setActiveRole('bistro')}
            >
              Bistro staff
            </button>
            <button
              type="button"
              className={activeRole === 'bistro_admin' ? 'pill active' : 'pill'}
              onClick={() => setActiveRole('bistro_admin')}
            >
              Admin Bistro
            </button>
          </div>
        )}
        {authMode === 'signup' && (
          <p className="signup-only-hint">Sign up is for teachers only. Bistro logins are created by the admin.</p>
        )}

        <form onSubmit={handleAuthSubmit} className="form-grid auth-form">
          {authMode === 'signup' && (
            <label className="field">
              <span className="field-label">Your name</span>
              <input
                type="text"
                autoComplete="name"
                placeholder="e.g. Jane Smith"
                value={authForm.name}
                onChange={(e) => setAuthForm({ ...authForm, name: e.target.value })}
              />
            </label>
          )}
          <label className="field">
            <span className="field-label">Email</span>
            <input
              type="email"
              autoComplete="email"
              placeholder="you@school.edu"
              value={authForm.email}
              onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })}
            />
          </label>
          <label className="field">
            <span className="field-label">Password</span>
            <input
              type="password"
              autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'}
              placeholder="••••••••"
              value={authForm.password}
              onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
            />
          </label>
          <button type="submit" className="btn-primary btn-wide glow">
            {authMode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>
        <p className="hint glass-hint">
          Demo admin Bistro: choose <strong>Admin Bistro</strong>, then <code>bistro@school.edu</code> /{' '}
          <code>demo123</code>. Staff accounts are created from Team after admin login.
        </p>
      </div>
    </div>
  )

  const renderAccountInner = ({ title, showClose }) => (
    <>
      <div className="cart-dropdown-head">
        <h3>{title}</h3>
        {showClose && (
          <button type="button" className="btn-text" onClick={() => setAccountPopoutOpen(false)}>
            Close
          </button>
        )}
      </div>
      <p className="account-line account-popout-line">
        <strong>{currentUser.name}</strong>
        <span className="muted">{currentUser.email}</span>
      </p>
      <form onSubmit={saveOwnAccount} className="form-grid account-edit-form">
        <label className="field">
          <span className="field-label">Name</span>
          <input
            type="text"
            autoComplete="name"
            value={accountForm.name}
            onChange={(e) => setAccountForm({ ...accountForm, name: e.target.value })}
          />
        </label>
        <label className="field">
          <span className="field-label">Email</span>
          <input
            type="email"
            autoComplete="email"
            value={accountForm.email}
            onChange={(e) => setAccountForm({ ...accountForm, email: e.target.value })}
          />
        </label>
        <label className="field">
          <span className="field-label">New password</span>
          <input
            type="password"
            autoComplete="new-password"
            placeholder="Leave blank to keep current"
            value={accountForm.password}
            onChange={(e) => setAccountForm({ ...accountForm, password: e.target.value })}
          />
        </label>
        <button type="submit" className="btn-primary btn-wide">
          Save changes
        </button>
      </form>
      <button type="button" className="btn-ghost btn-wide account-signout" onClick={signOut}>
        Sign out
      </button>
    </>
  )

  const renderAccountTeacher = () => (
    <div className="page page-enter">
      <div className="glass-card section-card">
        {renderAccountInner({ title: 'Your account', showClose: false })}
      </div>
    </div>
  )

  const renderAccountBistro = () => (
    <div className="page page-enter">
      <div className="glass-card section-card">
        {renderAccountInner({
          title: isBistroAdmin ? 'Admin Bistro account' : 'Bistro account',
          showClose: false,
        })}
      </div>
    </div>
  )

  const renderContent = () => {
    if (activePage === 'home') return renderHome()
    if (activePage === 'menu') {
      if (isBistroStaff) return renderMenuBistro()
      if (!currentUser) return renderMenuLocked()
      if (isTeacher) return renderMenuFull()
      return renderMenuLocked()
    }
    if (activePage === 'orders') {
      if (!currentUser) return renderOrdersGuest()
      if (isTeacher && isDesktop) {
        return (
          <div className="page page-enter desktop-orders-placeholder">
            <div className="glass-card section-card muted-placeholder">
              <p className="muted" style={{ margin: 0 }}>
                Open <strong>Orders</strong> in the sidebar to track your lunch in the slide-out panel—same
                idea as <strong>Cart</strong> on desktop.
              </p>
            </div>
          </div>
        )
      }
      if (isTeacher) return renderOrdersTeacherMobilePage()
      if (isBistroStaff) return renderOrdersBistro()
      return renderOrdersGuest()
    }
    if (activePage === 'management') {
      if (!isBistroAdmin) return renderHome()
      return renderManagement()
    }
    if (activePage === 'cart') {
      if (isTeacher) return renderCartMobilePage()
      return renderHome()
    }
    if (activePage === 'account') {
      if (!currentUser) return renderAccountGuest()
      if (isTeacher) return renderAccountTeacher()
      if (isBistroStaff) return renderAccountBistro()
    }
    return null
  }

  return (
    <div className="app-shell">
      <div className="noise" aria-hidden />

      <aside className="sidebar desktop-only" aria-label="Main navigation">
        <div className="sidebar-brand">
          <span className="brand-dot" />
          <span>Bistro</span>
        </div>
        <p className="sidebar-section-label">Navigate</p>
        <nav className="sidebar-nav">
          {navItemsList.map(({ id, label, Icon, isCart, isManagement }) => {
            const ordersNavActive =
              id === 'orders' && isTeacher && (isDesktop ? ordersPopoutOpen : activePage === 'orders')
            const isAccountPopout = id === 'account' && currentUser && isDesktop
            const navActive = isCart
              ? cartPopoutOpen
              : isAccountPopout
                ? accountPopoutOpen
              : id === 'orders' && isTeacher
                ? ordersNavActive
                : activePage === id
            return (
              <button
                key={id}
                ref={
                  isCart
                    ? cartSidebarBtnRef
                    : id === 'orders' && isTeacher
                      ? ordersSidebarBtnRef
                      : isAccountPopout
                        ? accountSidebarBtnRef
                        : undefined
                }
                type="button"
                className={`sidebar-link ${isCart ? 'sidebar-cart-link' : ''} ${navActive ? 'active' : ''}`}
                aria-expanded={
                  isCart
                    ? cartPopoutOpen
                    : id === 'orders' && isTeacher
                      ? ordersPopoutOpen
                      : isAccountPopout
                        ? accountPopoutOpen
                        : undefined
                }
                aria-controls={
                  isCart
                    ? 'cart-popout-panel'
                    : id === 'orders' && isTeacher
                      ? 'orders-popout-panel'
                      : isAccountPopout
                        ? 'account-popout-panel'
                        : undefined
                }
                onClick={() => {
                  if (isCart) {
                    setOrdersPopoutOpen(false)
                    setAccountPopoutOpen(false)
                    setCartPopoutOpen((open) => !open)
                  } else if (id === 'orders' && isTeacher && isDesktop) {
                    setCartPopoutOpen(false)
                    setAccountPopoutOpen(false)
                    setOrdersPopoutOpen((open) => !open)
                  } else if (isAccountPopout) {
                    setCartPopoutOpen(false)
                    setOrdersPopoutOpen(false)
                    setAccountPopoutOpen((open) => !open)
                  } else if (isManagement) {
                    goNav('management')
                  } else {
                    goNav(id)
                  }
                }}
              >
                <span className="sidebar-icon-wrap">
                  <Icon className="sidebar-icon" />
                  {isCart && cartCount > 0 && (
                    <span className="sidebar-cart-badge">{cartCount > 99 ? '99+' : cartCount}</span>
                  )}
                </span>
                <span className="sidebar-label">{label}</span>
              </button>
            )
          })}
        </nav>
      </aside>

      {isTeacher && (
        <div
          id="cart-popout-panel"
          ref={cartPanelRef}
          className={`cart-popout glass-panel desktop-only ${cartPopoutOpen ? 'visible' : ''}`}
          aria-hidden={!cartPopoutOpen}
        >
          {renderCartContents({ showClose: true })}
        </div>
      )}

      {isTeacher && (
        <div
          id="orders-popout-panel"
          ref={ordersPanelRef}
          className={`orders-popout glass-panel desktop-only ${ordersPopoutOpen ? 'visible' : ''}`}
          aria-hidden={!ordersPopoutOpen}
        >
          {renderOrdersTeacherInner({ showClose: true })}
        </div>
      )}

      {currentUser && (
        <div
          id="account-popout-panel"
          ref={accountPanelRef}
          className={`account-popout glass-panel desktop-only ${accountPopoutOpen ? 'visible' : ''}`}
          aria-hidden={!accountPopoutOpen}
        >
          {renderAccountInner({
            title: isBistroStaff
              ? isBistroAdmin
                ? 'Admin Bistro account'
                : 'Bistro account'
              : 'Your account',
            showClose: true,
          })}
        </div>
      )}

      <div className="main-area">
        <header className="top-bar glass-bar">
          <div>
            <h1 className="app-title">School Bistro</h1>
            <p className="app-subtitle">
              {currentUser
                ? `${currentUser.name} · ${
                    currentUser.role === 'bistro_admin'
                      ? 'Admin Bistro'
                      : currentUser.role === 'bistro'
                        ? 'Bistro staff'
                        : 'Teacher'
                  }`
                : 'Sign in to order'}
            </p>
          </div>
        </header>

        <main className="content-scroll">{renderContent()}</main>
      </div>

      <nav className="mobile-tabbar" aria-label="Mobile navigation">
        {navItemsList.map(({ id, label, Icon, isCart, isManagement }) => (
          <button
            key={id}
            type="button"
            className={`tab-item ${isCart ? 'cart-tab' : ''} ${
              isCart ? (activePage === 'cart' ? 'active' : '') : activePage === id ? 'active' : ''
            }`}
            onClick={() => {
              if (isCart) goNav('cart')
              else if (isManagement) goNav('management')
              else goNav(id)
            }}
          >
            {isCart ? (
              <span className="tab-icon-wrap">
                <Icon className="tab-icon" />
                {cartCount > 0 && <span className="tab-badge">{cartCount > 99 ? '99+' : cartCount}</span>}
              </span>
            ) : (
              <Icon className="tab-icon" />
            )}
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}

export default App
