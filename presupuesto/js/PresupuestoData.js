
var PresupuestoData = function(options) {

  var defaultConfig = { 
    entryPointURL: "http://elastic.restopengov.org/",
    dataSource: "apn",
    dataset: "presupuesto",
  };

  this.config = $.extend(defaultConfig, options); 

  this.restOpenGov = new RestOpenGov(this.config);

  this.data;

  this.COLORS = {
        '1 - ADMINISTRACION GUBERNAMENTAL' : '#e60042',
        '2 - SERVICIOS DE DEFENSA Y SEGURIDAD':'#ff7600',
        '3 - SERVICIOS SOCIALES':'#62e200',
        '4 - SERVICIOS ECONOMICOS':'#7309aa',
        '5 - DEUDA PUBLICA':'#ffddee'
      };

  this.search = function(options, callback, context) {

    var defaultOptions = {
        dataset: this.config.dataset,
        query: '*:*',
        limit: 300,
        from: 0,

        anio: undefined,
        cuenta: undefined,
        subcuenta: undefined
      };

      var searchParams = $.extend(defaultOptions, options);

      var that = this;

      if(!this.data){
        $.getJSON('source/data.json',function(rawData) {
          that.data = rawData;
          that.dataLoaded(options,rawData,callback,context,searchParams);
        });
      } else {
        that.dataLoaded(options,this.data,callback,context,searchParams);
      }


  };

  this.dataLoaded = function(options,rawData,callback,context,searchParams){
     
     if(searchParams.anio) {
        var rawData = rawData.filter(function(el){
          return (parseInt(el.anio)==parseInt(searchParams.anio));
        });
     }

      var data;

      switch(options.graph){
        case 'ring':
          data = this.processDataRing(rawData);
        break;
        default:
          data = this.processData(rawData);
        break;
      }

      if (context) {
        callback.call(context, data);
      } else {
        callback(data);
      }
  };

  this.processDataRing = function(data) {
    var temp = {},temp2 = [],json={};
    var anio;
    var instance = this;

    $(data).each(function(i,e){

        //cuenta
        if(!temp[e.cuenta]){
            anio = e.anio;
            temp[e.cuenta] = {
                id:e.cuenta,
                name:e.cuenta,
                data:{
                   "$color": instance.COLORS[e.cuenta], 
                   "$angularWidth": 0, 
                   "size": 0.0
                },
                children : []
            }       
        }
        
        temp[e.cuenta].data.size += parseFloat(e.valor.replace(".","").replace(",","."));

        temp[e.cuenta].data['$angularWidth'] += parseFloat(e.valor.replace(".","").replace(",","."));
        
        var c = {
                id:e.subcuenta,
                name:e.subcuenta,
                data:{
                   "$color": temp[e.cuenta].data['$color'], 
                   "$angularWidth": e.valor.replace(".","").replace(",",""), 
                   "size": parseFloat(e.valor.replace(".","").replace(",","."))
                }
        };
        temp[e.cuenta].children.push(c);        
             
    });
        
    $.each(temp, function(key, value) { 
      temp2.push(value);
    });
        
    json = {
            id:anio,
            name:anio,
            children : temp2                   
    };      

    return json;
  }

  // procesa la informacion "cruda" de RestOpenGov
  // y retorna la informacion del presupuesto segun la siguiente estructura:
  // presupuesto: {
  //   label: presupuesto 2007-2011
  //   total: xxx.xx
  //   detalle: {
  //     2007: {
  //       label: presupuesto 2007
  //       total: xxx.xx
  //       porcentaje: xx.xx
  //       detalle: {
  //         1 - ADMINISTRACION GUBERNAMENTAL: {
  //          label: 1 - ADMINISTRACION GUBERNAMENTAL
  //          total: xxx.xx
  //          porcentaje: xx.xx
  //          detalle: {
  //            11-Legislativa: {
  //              label: 11-Legislativa
  //              total: xxx.xx
  //              porcentaje: xx.xx
  //            }, [...]
  //          }
  //         }
  //       }
  //     }, [...]
  //   }
  // 
  // }
  this.processData = function(data) {

    // remove _source and all the rest of the elastic search info
    data = _.map(data, function(row) { return row });

    var presupuesto = {};

    var byAnio = _.groupBy(data, 'anio');

    // Presupuesto
    var anios = this._properties(byAnio);
    var anioFrom = _.min(anios);
    var anioTo = _.max(anios);

    presupuesto.label = 'Presupuesto ' + (anios.length == 1 ? anioFrom : anioFrom + '-' + anioTo);
    presupuesto.anios = anios.length;
    presupuesto.total = undefined;
    presupuesto.detalle = {};

    _.each(byAnio, function(anioRows, anioLabel) {

      // Anio
      var anio = {};
      anio.label = anioLabel;
      anio.detalle = {};

      var byCuenta = _.groupBy(anioRows, 'cuenta');
      _.each(byCuenta, function(cuentaRows, cuentaLabel) {

        // Cuenta
        var cuenta = {};
        cuenta.label = cuentaLabel;
        cuenta.detalle = {};

        _.each(cuentaRows, function(subcuentaRow) {

          // Subcuenta
          var subcuenta = {};
          subcuenta.label = subcuentaRow.subcuenta;
          subcuenta.total = this._strToNum(subcuentaRow.valor);

          cuenta.detalle[subcuenta.label] = subcuenta;
        }, this);
        cuenta.total = this._calculateTotal(cuenta.detalle);
        cuenta.valores = this._detalleAsArray(cuenta.detalle, 'total');
        cuenta.porcentajes = this._detalleAsArray(cuenta.detalle, 'porcentaje');

        anio.detalle[cuenta.label] = cuenta;
      }, this);
      anio.total = this._calculateTotal(anio.detalle);
      anio.valores = this._detalleAsArray(anio.detalle, 'total');
      anio.porcentajes = this._detalleAsArray(anio.detalle, 'porcentaje');

      presupuesto.detalle[anio.label] = anio;

    }, this);
    presupuesto.total = this._calculateTotal(presupuesto.detalle);
    presupuesto.valores = this._detalleAsArray(presupuesto.detalle, 'total');
    presupuesto.porcentajes = this._detalleAsArray(presupuesto.detalle, 'porcentaje');

    return presupuesto;

  }

  this._properties = function(obj) {
    var properties = [];
    for (prop in obj) {
      properties.push(prop);
    }
    return properties;
  }

  this._strToNum = function(value) {
    return this._formatNum(value.replace('.', '').replace(',', '.'));
  }

  this._formatNum = function(num) {
    return parseFloat(parseFloat(num).toFixed(2));
  }

  // retorna la suma total de los items, y actualiza el porcentaje de cada item
  this._calculateTotal = function(items) {
    var total = _.reduce(items, function(memo, item) { return memo + item.total }, 0);

    _.each(items, function(item) {
      item.porcentaje = this._formatNum(item.total * 100 / total);
    }, this);

    return this._formatNum(total);
  },

  // helper functions to get anios, cuentas, subcuentas
  this.getAnios = function(presupuestoData) {
    return this._properties(presupuestoData.detalle);
  },

  this.getCuentas = function(presupuestoData) {
    var cuentas = [];

    _.each(presupuestoData.detalle, function(anio, anioLabel) {
      var current = this._properties(anio.detalle);
      $.merge(cuentas, current);
    }, this);
    return _.uniq(cuentas);
  }

  this._detalleAsArray = function(items, campo) {
    return _.map(items, campo);
  }

};