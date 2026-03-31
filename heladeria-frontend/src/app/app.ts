import { Component, OnInit, signal, computed } from '@angular/core';
import { UpperCasePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://xcmxqnzulnmvaybpchzs.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhjbXhxbnp1bG5tdmF5YnBjaHpzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0OTc4NTEsImV4cCI6MjA5MDA3Mzg1MX0.UjsTx6m6SkO9Y98T-4w_onMkKI4YhVdk_zRIQF16jkQ';
const supabase = createClient(supabaseUrl, supabaseKey);

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [UpperCasePipe, FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit {
  // === CONTROL DE VISTAS (PÁGINAS) ===
  vistaActiva = signal<'inicio' | 'menu' | 'admin' | 'galeria' | 'ticket'>('inicio');

  cambiarVista(nuevaVista: 'inicio' | 'menu' | 'galeria') {
    this.vistaActiva.set(nuevaVista);
    window.scrollTo(0, 0); // Sube la pantalla hasta arriba al cambiar de vista
  }

  // === TICKET VIRTUAL (RASTREO EN TIEMPO REAL) ===
  pedidoActivo = signal<any | null>(null);
  ticketCargando = signal<boolean>(true);
  ticketError = signal<string>('');
  realtimeTicket: any = null;

  async cargarTicket(id: string) {
    this.ticketCargando.set(true);
    this.ticketError.set('');
    const { data, error } = await supabase
      .from('pedidos')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      this.ticketError.set('No se encontró el pedido. Puede que haya expirado.');
      this.ticketCargando.set(false);
      return;
    }
    this.pedidoActivo.set(data);
    this.ticketCargando.set(false);
    this.iniciarRealtimeTicket(id);
  }

  iniciarRealtimeTicket(id: string) {
    if (this.realtimeTicket) {
      this.realtimeTicket.unsubscribe();
    }
    this.realtimeTicket = supabase
      .channel(`ticket-pedido-${id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'pedidos', filter: `id=eq.${id}` },
        (payload) => {
          console.log('📡 Ticket actualizado en tiempo real:', payload.new);
          this.pedidoActivo.set(payload.new);

          // Si el estado es finalizado o rechazado, limpiar localStorage
          const nuevoEstado = payload.new['estado'];
          if (nuevoEstado === 'finalizado' || nuevoEstado === 'rechazado') {
            localStorage.removeItem('pedido_activo_heladeria');
          }
        }
      )
      .subscribe();
  }

  detenerRealtimeTicket() {
    if (this.realtimeTicket) {
      this.realtimeTicket.unsubscribe();
      this.realtimeTicket = null;
    }
  }

  volverDesdeTicket() {
    this.detenerRealtimeTicket();
    localStorage.removeItem('pedido_activo_heladeria');
    this.pedidoActivo.set(null);
    this.cambiarVista('inicio');
  }

  // === ADMIN: GESTIÓN DE PEDIDOS DE HOY (NUEVO FLUJO) ===
  tiempoEsperaSeleccionado = signal<number>(15);

  async aceptarPedidoHoy(pedido: any, minutos: number) {
    const { data: updatedRows, error } = await supabase
      .from('pedidos')
      .update({ estado: 'preparando', tiempo_espera: minutos })
      .eq('id', pedido.id)
      .select();

    if (error || !updatedRows?.length) {
      alert('Error al actualizar el pedido. Verifica las políticas RLS en Supabase.');
      return;
    }
    await this.cargarPedidos(true);
  }

  async rechazarPedidoHoy(pedido: any) {
    const { data: updatedRows, error } = await supabase
      .from('pedidos')
      .update({ estado: 'rechazado' })
      .eq('id', pedido.id)
      .select();

    if (error || !updatedRows?.length) {
      alert('Error al rechazar el pedido. Verifica las políticas RLS en Supabase.');
      return;
    }
    await this.cargarPedidos(true);
  }

  async marcarListo(pedido: any) {
    const { data: updatedRows, error } = await supabase
      .from('pedidos')
      .update({ estado: 'listo' })
      .eq('id', pedido.id)
      .select();

    if (error || !updatedRows?.length) {
      alert('Error al marcar como listo. Verifica las políticas RLS en Supabase.');
      return;
    }
    await this.cargarPedidos(true);
  }

  async marcarFinalizado(pedido: any) {
    const { data: updatedRows, error } = await supabase
      .from('pedidos')
      .update({ estado: 'finalizado' })
      .eq('id', pedido.id)
      .select();

    if (error || !updatedRows?.length) {
      alert('Error al finalizar el pedido. Verifica las políticas RLS en Supabase.');
      return;
    }
    await this.cargarPedidos(true);
  }

  todoLosProductos = signal<any[]>([]);

  // === OPCIONES DE PERSONALIZACIÓN POR CATEGORÍA ===
  saboresPaletasCubiertas: any[] = [
    { id: 'sabor-arroz', nombre: 'Arroz', precio: 0 },
    { id: 'sabor-cacahuate', nombre: 'Cacahuate', precio: 0 },
    { id: 'sabor-chocolate', nombre: 'Chocolate', precio: 0 },
    { id: 'sabor-coco', nombre: 'Coco', precio: 0 },
    { id: 'sabor-oreo', nombre: 'Oreo', precio: 0 },
    { id: 'sabor-vainilla', nombre: 'Vainilla', precio: 0 },
  ];

  toppingMilk: any[] = [
    { id: 'top-tapioca', nombre: 'Tapioca', precio: 15 }
  ];

  toppingFrappeYogur: any[] = [
    { id: 'top-fresa', nombre: 'Fresa', precio: 15 },
    { id: 'top-blueberry', nombre: 'Blueberry', precio: 15 },
    { id: 'top-mango', nombre: 'Mango', precio: 15 },
    { id: 'top-kiwi', nombre: 'Kiwi', precio: 15 },
  ];

  toppingFrappeCasa: any[] = [
    { id: 'top-tapioca-frappe', nombre: 'Tapioca', precio: 15 }
  ];

  // Categorías que tienen toppings (comparación en minúsculas)
  categoriaConToppings(categoriaOriginal: string): any[] {
    const cat = (categoriaOriginal || '').toLowerCase();
    
    // Paletas Cubiertas (El producto es la cobertura, el extra es el sabor)
    if (cat.includes('paletas cubiertas')) return this.saboresPaletasCubiertas;

    // Milk (Agrega tapioca solo sábados y domingos)
    if (cat.includes('milk')) {
      const day = new Date().getDay();
      if (day === 0 || day === 6) { // 0 = Domingo, 6 = Sábado
        return this.toppingMilk;
      }
    }

    // Frappé Yogur (Toppings de fruta)
    if (cat.includes('frappe yogur') || cat.includes('frappé yogur')) {
      return this.toppingFrappeYogur;
    }

    // Frappés de Casa (Tapioca opcional)
    if (cat.includes('frappe casa')) {
      return this.toppingFrappeCasa;
    }

    return [];
  }

  // Toppings del producto que se está personalizando
  toppingsDelProducto = computed(() => {
    const prod = this.productoPersonalizando();
    if (!prod) return [];
    return this.categoriaConToppings(prod.categoriaOriginal || prod.categoria);
  });

  // Estado para el Modal de Personalización
  productoPersonalizando = signal<any | null>(null);
  toppingsElegidos = signal<any[]>([]);

  precioTotalPersonalizado = computed(() => {
    const prod = this.productoPersonalizando();
    if (!prod) return 0;
    const base = prod.precio;
    const extras = this.toppingsElegidos().reduce((acc, t) => acc + t.precio, 0);
    return base + extras;
  });

  abrirPersonalizacion(producto: any) {
    const toppings = this.categoriaConToppings(producto.categoriaOriginal || producto.categoria);
    if (toppings.length === 0) {
      // Sin toppings → agregar directo al carrito
      this.agregarAlCarrito(producto);
      return;
    }
    // Con toppings → abrir modal para personalizar
    this.productoPersonalizando.set(producto);
    this.toppingsElegidos.set([]);
  }

  cerrarPersonalizacion() {
    this.productoPersonalizando.set(null);
    this.toppingsElegidos.set([]);
  }

  toggleTopping(topping: any) {
    const prod = this.productoPersonalizando();
    const esPaletaCubierta = prod && (prod.categoriaOriginal || prod.categoria || '').toLowerCase().includes('paletas cubiertas');

    this.toppingsElegidos.update(elegidos => {
      // Si es una paleta cubierta, el selector funciona como "radio button" (solo 1 sabor)
      if (esPaletaCubierta) {
        return [topping];
      }

      const existe = elegidos.findIndex(t => t.id === topping.id);
      if (existe !== -1) {
        return elegidos.filter(t => t.id !== topping.id);
      } else {
        return [...elegidos, topping];
      }
    });
  }

  confirmarYAgregar() {
    const prodBase = this.productoPersonalizando();
    if (!prodBase) return;

    const toppings = this.toppingsElegidos();
    const catOriginal = prodBase.categoriaOriginal || prodBase.categoria;
    const catLower = (catOriginal || '').toLowerCase();
    
    // Validar que se elija un sabor para paleta cubierta obligatoriamente
    if (catLower.includes('paletas cubiertas') && toppings.length === 0) {
      alert('Por favor, elige primero el sabor de la paleta que deseas cubrir.');
      return;
    }
    
    // Si no hay toppings, usa el ID normal. Si hay, crea un ID compuesto único para esta combinación.
    let configId = prodBase.id;
    let nombreCambiado = `${catOriginal} de ${prodBase.nombre}`;
    let sumaPrecioExtra = 0;

    if (toppings.length > 0) {
      // Ordenamos para generar un ID único
      const idsOrdenados = toppings.map(t => t.id).sort();
      configId = `${prodBase.id}-${idsOrdenados.join('-')}`;
      
      const nombresExtras = toppings.map(t => t.nombre).join(', ');
      
      if (catLower.includes('paletas cubiertas')) {
        nombreCambiado = `Paleta Cubierta de ${nombresExtras} (Con: ${prodBase.nombre})`;
      } else {
        nombreCambiado = `${catOriginal} de ${prodBase.nombre} (+${nombresExtras})`;
      }
      
      sumaPrecioExtra = toppings.reduce((acc, t) => acc + t.precio, 0);
    }

    const productoCompleto = {
      ...prodBase,
      id: configId, // Nuevo ID basado en combinación para que funcionen bien las cantidades
      nombre: nombreCambiado,
      precio: prodBase.precio + sumaPrecioExtra,
      toppings_detalle: toppings // opcional, para la bd
    };

    this.agregarAlCarrito(productoCompleto);
    this.cerrarPersonalizacion();
  }

  // ==========================================
  // === LÓGICA DEL ADMINISTRADOR (CORREGIDA) ===
  // ==========================================
  estaAutenticadoAdmin = signal<boolean>(false);
  passInput = signal<string>('');
  claveSecreta = 'helado123'; // Cambia esto después

  // Control de Pestañas (Tabs)
  adminTab = signal<'pedidos' | 'productos' | 'agenda' | 'galeria'>('pedidos');

  // Menú hamburguesa del admin
  menuAdminAbierto = signal<boolean>(false);
  toggleMenuAdmin() { this.menuAdminAbierto.set(!this.menuAdminAbierto()); }

  setAdminTabYCerrar(tab: 'pedidos' | 'productos' | 'agenda' | 'galeria') {
    this.setAdminTab(tab);
    this.menuAdminAbierto.set(false);
  }

  // Señales para datos
  pedidos = signal<any[]>([]);
  productosCrud = signal<any[]>([]); // Para la pestaña Mis Productos

  // Señales para el formulario de edición/creación
  productoEnEdicion = signal<any | null>(null); // null = creando nuevo
  mostrarModalProducto = signal<boolean>(false);

  // Variables para Auto-Refresh y Realtime
  autoRefreshOn = signal<boolean>(true);
  refrescoInterval: any;
  realtimeSubscription: any = null;

  // Funciones de Login y Navegación
  actualizarPass(evento: Event) {
    this.passInput.set((evento.target as HTMLInputElement).value);
  }

  entrarAlPanel() {
    if (this.passInput() === this.claveSecreta) {
      this.estaAutenticadoAdmin.set(true);
      this.cargarPedidos();
      this.iniciarAutoRefresh(); // Empieza a buscar en segundo plano por si acaso
      this.iniciarRealtime(); // Conexión sónica en vivo para pedidos
    } else {
      alert('❌ Contraseña incorrecta');
    }
  }

  cerrarSesionAdmin() {
    this.estaAutenticadoAdmin.set(false);
    this.passInput.set(''); // Limpia para mayor seguridad
    if (this.refrescoInterval) clearInterval(this.refrescoInterval);
    if (this.realtimeSubscription) {
      this.realtimeSubscription.unsubscribe();
      this.realtimeSubscription = null;
    }
  }

  toggleAutoRefresh() {
    this.autoRefreshOn.set(!this.autoRefreshOn());
    if (this.autoRefreshOn()) {
      this.iniciarAutoRefresh();
      alert('⏱️ Auto-Actualización ACTIVADA. Tus pedidos se buscarán solos.');
    } else {
      if (this.refrescoInterval) clearInterval(this.refrescoInterval);
      alert('⏸️ Auto-Actualización PAUSADA.');
    }
  }

  iniciarAutoRefresh() {
    if (this.refrescoInterval) clearInterval(this.refrescoInterval);
    this.refrescoInterval = setInterval(() => {
      if (this.estaAutenticadoAdmin() && this.adminTab() === 'pedidos' && this.autoRefreshOn()) {
        this.cargarPedidos(true); // Call it in background silently
      }
    }, 15000); // 15 segundos
  }

  iniciarRealtime() {
    // Escucha eventos de "NUEVOS INSERTOS" en la tabla pedidos
    this.realtimeSubscription = supabase
      .channel('notificaciones-pedidos')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'pedidos' },
        (payload) => {
          console.log('¡🔔 BOOM! Pedido Nuevo Detectado en Vivo:', payload);
          this.reproducirSonido();
          this.cargarPedidos(true); // Recarga silenciosa al vuelo
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ Conectado a Supabase Realtime exitosamente.');
        }
      });
  }

  reproducirSonido() {
    try {
      // Audio muy corto, agradable y permanente de los servidores de Google para evitar bloqueos
      const audio = new Audio('https://actions.google.com/sounds/v1/cartoon/pop.ogg');
      audio.volume = 1.0;
      audio.play().catch(e => console.log('El auto-play fue bloqueado:', e));
    } catch (error) {
      console.log('Error de audio:', error);
    }
  }

  refrescarTodoManual() {
    if (this.adminTab() === 'pedidos') this.cargarPedidos();
    if (this.adminTab() === 'productos') this.cargarProductosCrud();
    if (this.adminTab() === 'galeria') this.cargarGaleria();
  }

  // ¡ESTA ES LA FUNCIÓN QUE HACE QUE CAMBIEN LAS PESTAÑAS!
  setAdminTab(tab: 'pedidos' | 'productos' | 'agenda' | 'galeria') {
    this.adminTab.set(tab);
    if (tab === 'pedidos') this.cargarPedidos();
    if (tab === 'productos') this.cargarProductosCrud();
    if (tab === 'galeria') this.cargarGaleria();
  }

  // --- GESTIÓN DE PEDIDOS ---
  pedidosVisibles = computed(() => {
    return this.pedidos().filter(p => p.estatus !== 'rechazado');
  });

  async cargarPedidos(silencioso = false) {
    if (!silencioso) console.log('Cargando pedidos...');
    const { data, error } = await supabase
      .from('pedidos')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error cargando pedidos:', error);
      if (!silencioso) alert('Error al cargar pedidos.');
    }
    else this.pedidos.set(data || []);
  }

  // --- FUNCIÓN MÁGICA: ACTUALIZA Y AVISA POR WHATSAPP AL CLIENTE ---
  async cambiarEstatusPedido(pedido: any, nuevoEstatus: string, abrirWhats = true) {

    // Si aceptamos una reserva, el estatus final será 'agendado'
    let estatusFinal = nuevoEstatus;
    if (nuevoEstatus === 'aceptado' && pedido.tipo_pedido === 'agendado') {
      estatusFinal = 'agendado';
    }

    const { data: updatedRows, error } = await supabase
      .from('pedidos')
      .update({ estatus: estatusFinal })
      .eq('id', pedido.id)
      .select();

    if (error) {
      console.error('Error al actualizar estatus:', error);
      alert('Error al actualizar la base de datos.');
      return;
    }

    // SI SUPABASE NO ACTUALIZA FILAS POR REGLAS RLS (Row Level Security), DEVUELVE 0 FILAS AFECTADAS:
    if (!updatedRows || updatedRows.length === 0) {
      alert('⚠️ EL PEDIDO NO SE GUARDÓ EN LA AGENDA.\n\nEsto ocurre porque la tabla "pedidos" en Supabase tiene restricciones (RLS) que bloquean la modificación (UPDATE).\n\nPara solucionarlo, ve a tu panel de Supabase > Authentication > Policies y crea una política que permita "UPDATE" en la tabla "pedidos".');
      return;
    }

    // Recargar para aplicar colores e indicadores (Anotar en agenda instantáneo)
    await this.cargarPedidos(true);

    if (abrirWhats) {
      this.enviarWhatsAppDirecto(pedido, estatusFinal);
    } else {
      if (estatusFinal === 'agendado' || estatusFinal === 'aceptado') {
        this.agendaExitoNombre.set(pedido.cliente_nombre);
        this.mostrarAgendaExitoModal.set(true);
        
        // Magia: Ir a la pestaña de agenda y abrir el día en automático
        let f = pedido.fecha_entrega;
        if (!f && pedido.created_at) f = pedido.created_at.substring(0, 10);
        
        if (f) {
          const partes = f.split('-');
          if (partes.length === 3) {
            const tempDate = new Date(Number(partes[0]), Number(partes[1]) - 1, Number(partes[2]));
            this.fechaSeleccionada.set(tempDate);
            this.mesReferencia.set(new Date(Number(partes[0]), Number(partes[1]) - 1, 1));
          }
        } else {
            this.fechaSeleccionada.set(new Date());
        }
        
        this.setAdminTab('agenda');
      }
    }
  }

  enviarWhatsAppDirecto(pedido: any, estatus: string) {
    if (!pedido.cliente_telefono) {
      alert("Este pedido no tiene teléfono registrado.");
      return;
    }

    let mensaje = '';
    if (estatus === 'aceptado' || estatus === 'agendado') {
      mensaje = `¡Hola ${pedido.cliente_nombre}! 🎉\n\nTu pedido en *Heladería Libertad* ha sido *ACEPTADO*.\nNos vemos el día ${pedido.fecha_entrega || 'de hoy'}${pedido.hora_entrega ? ' a las ' + pedido.hora_entrega : ''}. ¡Gracias por tu preferencia! 🍦`;
    } else if (estatus === 'rechazado') {
      mensaje = `Hola ${pedido.cliente_nombre}. 😔\n\nLamentamos informarte que en este momento no podemos procesar tu pedido. Por favor, contáctanos por este medio si tienes dudas.`;
    } else if (estatus === 'entregado') {
      mensaje = `¡Gracias por tu compra, ${pedido.cliente_nombre}! 🍦 Esperamos que lo disfrutes muchísimo.`;
    }

    if (mensaje !== '') {
      const urlWhatsApp = `https://wa.me/52${pedido.cliente_telefono}?text=${encodeURIComponent(mensaje)}`;
      window.open(urlWhatsApp, '_blank');
    }
  }

  // --- GESTIÓN DE PRODUCTOS Y FOTOS ---
  categoriasAdmin = signal<string[]>([]); // Para organizar la vista por categoría
  fotoSeleccionada = signal<File | null>(null); // Guarda el archivo a subir

  async cargarProductosCrud() {
    const { data, error } = await supabase
      .from('productos')
      .select('*')
      .order('categoria')
      .order('nombre');

    if (!error && data) {
      this.productosCrud.set(data);
      const categoriasUnicas = [...new Set(data.map((p: any) => p.categoria))];
      this.categoriasAdmin.set(categoriasUnicas as string[]);
    }
  }

  // Filtra los productos por categoría para mostrarlos en secciones
  obtenerProductosPorCategoria(categoria: string) {
    return this.productosCrud().filter(p => p.categoria === categoria);
  }

  abrirModalCrear() {
    this.productoEnEdicion.set(null);
    this.fotoSeleccionada.set(null);
    this.mostrarModalProducto.set(true);
  }

  abrirModalEditar(producto: any) {
    this.productoEnEdicion.set(producto);
    this.fotoSeleccionada.set(null);
    this.mostrarModalProducto.set(true);
  }

  cerrarModalProducto() { this.mostrarModalProducto.set(false); }

  // Captura el archivo cuando lo eliges en tu computadora
  seleccionarFoto(evento: any) {
    this.fotoSeleccionada.set(evento.target.files[0]);
  }

  // === LA MAGIA DE SUBIR FOTOS Y GUARDAR ===
  async guardarProducto(datosForm: any) {
    let urlDeLaFoto = this.productoEnEdicion()?.foto || ''; // Conserva la foto si no se cambia

    // 1. SI HAY FOTO NUEVA, LA SUBIMOS A SUPABASE STORAGE
    if (this.fotoSeleccionada()) {
      const archivo = this.fotoSeleccionada()!;
      const nombreArchivo = `${Date.now()}_${archivo.name.replace(/\s+/g, '_')}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('productos')
        .upload(nombreArchivo, archivo, {
          contentType: archivo.type,
          upsert: false
        });

      if (uploadError) {
        // Mostramos el error REAL para poder diagnosticarlo
        console.error('Error de Storage:', uploadError);
        alert(`Error al subir la foto:\n${uploadError.message}\n\nRevisa las políticas del bucket en Supabase Storage.`);
        return;
      }

      const { data: publicUrlData } = supabase.storage
        .from('productos')
        .getPublicUrl(nombreArchivo);

      urlDeLaFoto = publicUrlData.publicUrl;
    }

    // 2. PREPARAMOS LOS DATOS PARA LA TABLA
    const productoData: any = {
      nombre: datosForm.nombre,
      categoria: datosForm.categoria,
      precio: Number(datosForm.precio),
      activo: true
    };

    // Solo incluimos la foto si existe una URL
    if (urlDeLaFoto) {
      productoData.foto = urlDeLaFoto;
    }

    // 3. GUARDAMOS EN BASE DE DATOS (Insertar o Actualizar)
    let dbError: any = null;
    if (this.productoEnEdicion()) {
      const { error } = await supabase.from('productos').update(productoData).eq('id', this.productoEnEdicion().id);
      dbError = error;
    } else {
      const { error } = await supabase.from('productos').insert([productoData]);
      dbError = error;
    }

    if (dbError) {
      console.error('Error al guardar en BD:', dbError);
      alert(`Error al guardar el producto:\n${dbError.message}`);
      return;
    }

    this.cargarProductosCrud();
    this.cerrarModalProducto();
    this.mostrarProductoExitoModal.set(true);
  }

  async darDeBajaProducto(id: string) {
    this.productoBajaId.set(id);
    this.mostrarConfirmBajaModal.set(true);
  }

  async confirmarBajaProducto() {
    const id = this.productoBajaId();
    if (id) {
      await supabase.from('productos').update({ activo: false }).eq('id', id);
      this.cargarProductosCrud();
    }
    this.mostrarConfirmBajaModal.set(false);
    this.productoBajaId.set('');
  }

  cancelarBajaProducto() {
    this.mostrarConfirmBajaModal.set(false);
    this.productoBajaId.set('');
  }
  categorias = signal<string[]>([]);
  categoriaSeleccionada = signal<string>('TODOS');

  productosFiltrados = computed(() => {
    const todos = this.todoLosProductos();
    const categoria = this.categoriaSeleccionada();
    if (categoria === 'TODOS') return todos;
    return todos.filter(p => p.categoria === categoria);
  });

  // ==========================================
  // === LÓGICA DE GALERÍA DE FOTOS ===
  // ==========================================
  fotosGaleria = signal<any[]>([]);
  subiendoFotoGaleria = signal<boolean>(false);

  // 1. Traer las fotos de la base de datos
  async cargarGaleria() {
    const { data, error } = await supabase
      .from('galeria')
      .select('*')
      .order('fecha_creacion', { ascending: false }); // Las más nuevas primero
    
    if (data) {
      this.fotosGaleria.set(data);
    }
  }

  // 2. Subir una foto nueva
  async subirFotoGaleria(event: any) {
    const archivo = event.target.files[0];
    if (!archivo) return;

    this.subiendoFotoGaleria.set(true);
    
    // Crear un nombre único para que no choquen los archivos
    const extension = archivo.name.split('.').pop();
    const nombreUnico = `${Date.now()}.${extension}`;

    // A. Subir el archivo al Storage (Asegúrate que se llame 'galeria-heladeria')
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('galeria-heladeria')
      .upload(nombreUnico, archivo);

    if (uploadError) {
       // Usamos un alert temporal, idealmente luego podríamos usar custom modal
      alert('Hubo un error al subir la imagen: ' + uploadError.message);
      this.subiendoFotoGaleria.set(false);
      return;
    }

    // B. Obtener el link público de la foto
    const { data: { publicUrl } } = supabase.storage
      .from('galeria-heladeria')
      .getPublicUrl(nombreUnico);

    // C. Guardar ese link en nuestra nueva tabla SQL
    await supabase.from('galeria').insert([
      { url_imagen: publicUrl }
    ]);

    this.subiendoFotoGaleria.set(false);
    this.cargarGaleria(); // Recargar la lista para ver la foto nueva
  }

  // 3. Eliminar una foto
  async eliminarFotoGaleria(id: number) {
    const confirmar = confirm('¿Seguro que deseas borrar esta foto de la galería?');
    if (!confirmar) return;

    await supabase.from('galeria').delete().eq('id', id);
    this.cargarGaleria();
  }

  // === FECHAS Y HORARIOS (Lógica original de Agenda) ===
  carrito = signal<any[]>([]);
  cantidadCarrito = computed(() => this.carrito().reduce((total, item) => total + item.cantidad, 0));
  totalCarrito = computed(() => this.carrito().reduce((total, item) => total + (item.precio * item.cantidad), 0));

  // === HORARIO TEMPORAL: ABIERTO TODO EL DÍA PARA PRUEBAS ===
  // ⚠️ RESTAURAR: momentoApertura = (18*60)+30, momentoCierre = (23*60)
  estaAbierta = computed(() => {
    return true; // MODO PRUEBAS: siempre abierto
  });

  // === MODO DE PEDIDO ===
  esPedidoAgendado = signal<boolean>(false);
  nombreCliente = signal<string>('');
  telefonoCliente = signal<string>(''); // NUEVO: teléfono del cliente
  fechaAgenda = signal<string>('');
  horaAgenda = signal<string>('');

  setTipoPedido(esAgendado: boolean) {
    this.esPedidoAgendado.set(esAgendado);
  }

  actualizarNombre(evento: Event) {
    this.nombreCliente.set((evento.target as HTMLInputElement).value);
  }

  actualizarTelefono(evento: Event) {
    this.telefonoCliente.set((evento.target as HTMLInputElement).value);
  }

  actualizarDato(campo: string, evento: Event) {
    const valor = (evento.target as HTMLInputElement).value;
    if (campo === 'nombre') this.nombreCliente.set(valor);
    if (campo === 'hora') this.horaAgenda.set(valor);
  }

  // === LÓGICA DEL CALENDARIO CUSTOM ===
  mesReferencia = signal<Date>(new Date());
  fechaSeleccionada = signal<Date | null>(null);

  nombreMes(fecha: Date): string {
    const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    return meses[fecha.getMonth()];
  }

  esMismaFecha(d1: Date, d2: Date | null): boolean {
    if (!d2) return false;
    return d1.getDate() === d2.getDate() && d1.getMonth() === d2.getMonth() && d1.getFullYear() === d2.getFullYear();
  }

  esFechaPasada(dia: Date): boolean {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    return dia < hoy;
  }

  // --- LÓGICA DE DÍAS BLOQUEADOS ---
  fechasBloqueadas = signal<string[]>([]);

  async cargarFechasBloqueadas() {
    const { data, error } = await supabase.from('fechas_bloqueadas').select('fecha');
    if (!error && data) {
      this.fechasBloqueadas.set(data.map(d => d.fecha));
    }
  }

  formatearFechaDB(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  esFechaBloqueada(dia: Date): boolean {
    const strFecha = this.formatearFechaDB(dia);
    return this.fechasBloqueadas().includes(strFecha);
  }

  esDiaInvalido(dia: Date): boolean {
    return this.esFechaPasada(dia) || this.esFechaBloqueada(dia);
  }

  cambiarMes(delta: number) {
    const actual = this.mesReferencia();
    this.mesReferencia.set(new Date(actual.getFullYear(), actual.getMonth() + delta, 1));
  }

  seleccionarFecha(dia: Date) {
    // Si estamos en vista cliente, prohibimos seleccionar días bloqueados o pasados
    if (this.vistaActiva() !== 'admin' && this.esDiaInvalido(dia)) return;
    
    this.fechaSeleccionada.set(dia);
    this.fechaAgenda.set(`${dia.getDate()}/${dia.getMonth() + 1}/${dia.getFullYear()}`);
  }

  diasCalendario = computed(() => {
    const ref = this.mesReferencia();
    const year = ref.getFullYear();
    const month = ref.getMonth();

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const days: (Date | null)[] = [];
    for (let i = 0; i < firstDay; i++) { days.push(null); }
    for (let i = 1; i <= daysInMonth; i++) { days.push(new Date(year, month, i)); }
    return days;
  });

  // === LÓGICA DE LA VISTA DEL CARRITO ===
  mostrarCarritoModal = signal<boolean>(false);
  mostrarExitoModal = signal<boolean>(false);

  // Modales CRUD productos (admin)
  mostrarProductoExitoModal = signal<boolean>(false);
  mostrarConfirmBajaModal = signal<boolean>(false);
  productoBajaId = signal<string>('');

  cerrarExitoModal() {
    this.mostrarExitoModal.set(false);
  }

  // Modal de éxito al anotar en agenda (admin)
  mostrarAgendaExitoModal = signal<boolean>(false);
  agendaExitoNombre = signal<string>('');

  cerrarAgendaExitoModal() {
    this.mostrarAgendaExitoModal.set(false);
  }

  abrirCarrito() {
    this.mostrarCarritoModal.set(true);
  }

  cerrarCarrito() {
    this.mostrarCarritoModal.set(false);
  }

  eliminarDelCarrito(id: string) {
    this.carrito.update(items => {
      const index = items.findIndex(item => item.id === id);
      if (index !== -1) {
        const nuevos = [...items];
        // Si hay más de 1, le restamos 1. Si solo hay 1, lo borramos de la lista.
        if (nuevos[index].cantidad > 1) {
          nuevos[index].cantidad--;
        } else {
          nuevos.splice(index, 1);
        }
        return nuevos;
      }
      return items;
    });

    // Si borró todo y el carrito quedó vacío, cerramos la ventanita solos
    if (this.carrito().length === 0) {
      this.cerrarCarrito();
    }
  }

  // === ACCIONES ===
  agregarAlCarrito(producto: any) {
    // Si el nombre aún no tiene el prefijo de categoría, lo agregamos
    const catOriginal = producto.categoriaOriginal || producto.categoria;
    let nombreFinal = producto.nombre;
    // Solo agregar si no empieza con la categoría ya (evitar duplicados)
    const catLower = (catOriginal || '').toLowerCase();
    if (!nombreFinal.toLowerCase().startsWith(catLower)) {
      nombreFinal = `${catOriginal} de ${nombreFinal}`;
    }

    const productoConCategoria = { ...producto, nombre: nombreFinal };

    this.carrito.update(items => {
      const index = items.findIndex(item => item.id === productoConCategoria.id);
      if (index !== -1) {
        const nuevos = [...items];
        nuevos[index].cantidad++;
        return nuevos;
      }
      return [...items, { ...productoConCategoria, cantidad: 1 }];
    });
  }

  // === PROCESAR PEDIDO (WEB Y WHATSAPP) ===
  async procesarPedido() {

    // VALIDACIÓN: Exigir teléfono
    if (!this.telefonoCliente() || this.telefonoCliente().length < 10) {
      alert('Por favor, ingresa un número de WhatsApp válido a 10 dígitos para poder contactarte.');
      return;
    }

    // 1. Preparamos la fecha para la BD
    let f = (this.esPedidoAgendado() && this.fechaSeleccionada()) ? this.fechaSeleccionada()! : new Date();
    let fechaDB = `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;

    // 2. GUARDAR EN SUPABASE PRIMERO (ahora incluye el teléfono)
    try {
      const { error } = await supabase
        .from('pedidos')
        .insert([
          {
            cliente_nombre: this.nombreCliente() || 'Cliente Sin Nombre',
            cliente_telefono: this.telefonoCliente(), // GUARDAMOS EL TELÉFONO
            tipo_pedido: this.esPedidoAgendado() ? 'agendado' : 'hoy',
            fecha_entrega: fechaDB,
            hora_entrega: this.esPedidoAgendado() ? this.horaAgenda() : null,
            productos: this.carrito(),
            total: this.totalCarrito(),
            estatus: 'pendiente'
          }
        ]);

      if (error) {
        console.error('Error al guardar en Supabase:', error);
        alert(`Hubo un error al procesar el pedido en la base de datos.\n\nDetalle: ${error.message}\n\nPor favor envíame una captura de este error.`);
        return;
      }
    } catch (err) {
      console.error('Error de conexión:', err);
      return;
    }

    // 3. ¿QUÉ HACEMOS DESPUÉS DE GUARDAR?
    if (this.esPedidoAgendado()) {
      // === RUTA 100% WEB (PARA AGENDAS) ===
      this.carrito.set([]);
      this.cerrarCarrito();
      this.mostrarExitoModal.set(true);

    } else {
      // === RUTA TICKET VIRTUAL (PARA "HOY") ===
      // Obtenemos el ID del pedido recién creado
      const { data: pedidoCreado } = await supabase
        .from('pedidos')
        .select('id')
        .eq('cliente_nombre', this.nombreCliente() || 'Cliente Sin Nombre')
        .eq('tipo_pedido', 'hoy')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      const pedidoId = pedidoCreado?.id;

      // Guardar en localStorage como respaldo
      if (pedidoId) {
        localStorage.setItem('pedido_activo_heladeria', pedidoId);
      }

      // Limpiar carrito
      this.carrito.set([]);
      this.cerrarCarrito();

      // Navegar al Ticket Virtual
      if (pedidoId) {
        await this.cargarTicket(pedidoId);
      }
      this.vistaActiva.set('ticket');
      window.scrollTo(0, 0);
    }
  }

  ngOnInit() {
    // Si la URL termina en /admin, forzamos la vista del administrador
    if (window.location.pathname === '/admin') {
      this.vistaActiva.set('admin');
    }

    // Si hay un ticket activo en localStorage, recuperarlo
    const ticketGuardado = localStorage.getItem('pedido_activo_heladeria');
    if (ticketGuardado && window.location.pathname !== '/admin') {
      this.vistaActiva.set('ticket');
      this.cargarTicket(ticketGuardado);
    }

    // Cargamos todo para el menú público y el calendario
    this.cargarFechasBloqueadas();
    this.cargarProductosMenu();
    this.cargarGaleria();
  }

  // === ADMIN: BLOQUEAR FECHAS ===
  async toggleBloqueoFecha(dia: Date) {
    const fechaFormat = this.formatearFechaDB(dia);
    const estaBloqueada = this.esFechaBloqueada(dia);

    if (estaBloqueada) {
      const { error } = await supabase.from('fechas_bloqueadas').delete().eq('fecha', fechaFormat);
      if (!error) {
        this.fechasBloqueadas.update(arr => arr.filter(f => f !== fechaFormat));
      } else alert('Error al desbloquear el día.');
    } else {
      const { error } = await supabase.from('fechas_bloqueadas').insert([{ fecha: fechaFormat }]);
      if (!error) {
        this.fechasBloqueadas.update(arr => [...arr, fechaFormat]);
      } else alert('Error al bloquear el día.');
    }
  }

  pedidosDelDia = computed(() => {
    if (!this.fechaSeleccionada()) return [];
    const fechaSelectStr = this.formatearFechaDB(this.fechaSeleccionada()!);
    return this.pedidos().filter(p => {
      let f = p.fecha_entrega ? String(p.fecha_entrega).substring(0, 10) : '';
      // Magia: si por alguna razón no tiene fecha (ej. pedidos antiguos de 'hoy'), tomamos su fecha de creación
      if (!f && p.created_at) f = String(p.created_at).substring(0, 10);
      
      const est = p.estatus ? String(p.estatus).trim().toLowerCase() : '';
      return f === fechaSelectStr && (est === 'agendado' || est === 'aceptado');
    });
  });

  pedidosAgendadosCount = computed(() => {
    const conteo: Record<string, number> = {};
    const agendados = this.pedidos().filter(p => {
      const est = p.estatus ? String(p.estatus).trim().toLowerCase() : '';
      return est === 'agendado' || est === 'aceptado';
    });
    agendados.forEach(p => {
      let f = p.fecha_entrega ? String(p.fecha_entrega).substring(0, 10) : '';
      if (!f && p.created_at) f = String(p.created_at).substring(0, 10);
      
      if (f) {
        conteo[f] = (conteo[f] || 0) + 1;
      }
    });
    return conteo;
  });

  async cargarProductosMenu() {
    const { data, error } = await supabase
      .from('productos')
      .select('*')
      .eq('activo', true)       // Solo mostramos los activos al cliente
      .order('categoria')
      .order('nombre');

    if (error) {
      console.error('Error al cargar productos del menú:', error);
      return;
    }

    const productos = data || [];
    const productosNormales: any[] = [];

    // Agrupamos categorías que queremos unificar en el filtro
    productos.forEach((producto: any) => {
      // Si la categoría contiene 'topping', lo ignoramos (ya no se usan toppings de BD)
      if (producto.categoria && producto.categoria.toLowerCase().includes('topping')) {
        return; // Ignorar productos tipo topping de la BD
      }

      // Guardamos la categoría original antes de unificar
      const categoriaOriginal = producto.categoria;

      const categoriasParaUnir = ['Helado', 'Gomipaletas', 'Paletas'];
      if (categoriasParaUnir.includes(producto.categoria)) {
        productosNormales.push({ ...producto, categoriaOriginal, categoria: 'Helados y Paletas' });
      } else {
        productosNormales.push({ ...producto, categoriaOriginal });
      }
    });

    this.todoLosProductos.set(productosNormales);

    // Sacamos las categorías únicas para los botones de filtro
    const categoriasUnicas = [...new Set(productosNormales.map((p: any) => p.categoria))];
    this.categorias.set(['TODOS', ...categoriasUnicas as string[]]);
  }

  seleccionarCategoria(categoria: string) {
    this.categoriaSeleccionada.set(categoria);
  }
}
