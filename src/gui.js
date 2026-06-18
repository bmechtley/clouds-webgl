import * as THREE from 'three';
import * as DAT from 'dat.gui';

function is_object(v) {
  return (v && typeof v === 'object' && !Array.isArray(v) && v !== null);
}

function merge_objects(target, source) {
  if (is_object(target) && is_object(source)) {
    Object.keys(source).map(k => {
      if (is_object(source[k])) {
        if (!target[k])
          Object.assign(target, { [k]: {} });

        merge_objects(target[k], source[k]);
      } else
        Object.assign(target, { [k]: source[k] });
    });
  }
  return target;
}

const defaults = {
  display: 'density',
  simulation: {
    dim: [512, 512],
    closed: [false, false, false, false],
    origin: [0, 1],
    pressure_iterations: 20,
    viscosity_iterations: 0
  },
  dynamics: {
    dx: 30,
    dt: 0.9,
    viscosity: 0,
    vorticity_confinement: 10
  },
  environment: {
    p0: 70,
    T0: 150,
    lapse: 6.5,
    Lv: 2501000,
    external_viscosity_gain: 0,
    dry_cv: 717,
    dry_cp: 1004,
    vapor_cv: 1388.5,
    vapor_cp: 1850
  },
  additional: {
    wind: [0, 0]
  },
  external: {
    viscosity_gain: 0,
    mouse_velocity: 2,
    mouse_radius: 0.1,
    mouse_sharpness: 1.0,
    mouse_density: {
      liquid: 0,
      vapor: 0.1,
      temperature: 0
    }
  },
  visualization: {
    velocity: {
      low: -.1,
      high: .1,
      contrast: 1
    },
    density: {
      contrast: {
        liquid: .231,
        vapor: .0889,
        temperature: 1
      },
      low: {
        liquid: 0,
        vapor: 0,
        temperature: 230
      },
      high: {
        liquid: 0.0048,
        vapor: 0.002,
        temperature: 785
      }
    }
  }
};

export const presets = {
  preset: 'flat', 
  closed: false,
  remembered: {
    flat: { '0': {
      simulation: {
        periodic: [true, true]
      },
      dynamics: {
        dissipation_velocity: [1, 1, 1], 
        dissipation_density: [.99, .99, .95]
      },
      environment: {
        gravity: [0, -.01], z0: -37981
      }
    }},
    vertical: { '0': {
      simulation: {
        periodic: [true, false]
      },
      dynamics: {
        dissipation_velocity: [.98, .98, 0],
        dissipation_density: [1, 1, 1]
      },
      environment: {
        gravity: [0, -.001],
        z0: 0
      }
    }}
  }
}

Object.values(presets.remembered)
  .filter(v => v.hasOwnProperty('0'))
  .forEach(v => merge_objects(v['0'], defaults));

const ranges = {
  render: {value: true},
  //presets: {value: 'flat', options: Object.keys(presets)},
  display: {value: 'density', options: ['density', 'velocity']},
  simulation: {
    pressure_iterations: {min: 0, max: 50, step: 1},
    viscosity_iterations: {min: 0, max: 50, step: 1},
    origin: {min: [0, 0], max: [0, 0], step: 0.01},
  },
  dynamics: {
    dissipation_density: {
      min: [0, 0, 0], max: [1, 1, 1], step: [0.01, 0.01, 0.01]
    },
    dissipation_velocity: {
      min: [0, 0, 0], max: [1, 1, 1], step: [0.01, 0.01, 0.01]
    },
    viscosity: {min: 0, max: 10, step: 0.01},
    dx: {min: 0, max: 100, step: 0.01},
    dt: {min: 0, max: 2, step: 0.01},
    vorticity_confinement: {min: 0, max: 100, step: 0.01}
  },
  environment: {
    T0: {min: 0, max: 1000, step: 0.01},
    dry_cp: {min: 0, max: 3000, step: 0.01},
    dry_cv: {min: 0, max: 3000, step: 0.01},
    vapor_cp: {min: 0, max: 3000, step: 0.01},
    vapor_cv: {min: 0, max: 3000, step: 0.01},
    Lv: {min: 0, max: 5000000, step: 1},
    lapse: {min: -100, max: 100, step: 0.01},
    p0: {min: 0, max: 1000, step: 0.01}
  },
  additional: {
    wind: {min: [-100, -100], max: [100, 100], step: [0.01, 0.01]},
  },
  external: {
    viscosity_gain: {min: -10, max: 10, step: 0.01},
    mouse_velocity: {min: -100, max: 100, step: 0.01},
    mouse_radius: {min: 0, max: 2, step: 0.01},
    mouse_sharpness: {min: 0, max: 10, step: 0.01},
    mouse_density: {
      liquid: { min: 0, max: 0.1, step: 0.0001 },
      vapor: { min: 0, max: 0.1, step: 0.0001 }, 
      temperature: { min: 0, max: 0.1, step: 0.0001 }
    }
  },
  visualization: {
    velocity: {
      low: {min: -100, max: 100, step: 0.0001},
      high: {min: -100, max: 100, step: 0.0001},
      contrast: {min: 0, max: 10, step: 0.0001}
    },
    density: {
      low: {
        liquid: {min: 0, max: 0.1, step: 0.0001},
        vapor: {min: 0, max: 0.1, step: 0.0001},
        temperature: {min: 0, max: 1000, step: 0.0001}
      },
      high: {
        liquid: {min: 0, max: 0.1, step: 0.0001},
        vapor: {min: 0, max: 0.1, step: 0.0001},
        temperature: {min: 0, max: 1000, step: 0.0001}
      },
      contrast: {
        liquid: {min: 0, max: 2, step: 0.0001},
        vapor: {min: 0, max: 2, step: 0.0001},
        temperature: {min: 0, max: 2, step: 0.0001}
      }
    }
  }
};

function valueify(paramset) {
  Object.keys(paramset).map(k => {
    if (is_object(paramset[k])) valueify(paramset[k])
    else paramset[k] = {value: paramset[k]}
  });

  return paramset;
}

export const parameters = valueify(
  JSON.parse(JSON.stringify(presets.remembered.flat['0']))
);

function set_ranges(paramset = parameters, rangeset = ranges) {
  if (paramset.hasOwnProperty('value'))
    Object.assign(paramset, rangeset);
  else if (typeof paramset == 'object' && typeof rangeset == 'object')
    Object.keys(paramset).map(k => set_ranges(paramset[k], rangeset[k]))
}

merge_objects(parameters, ranges);

export const uniforms = {}, guiparams = {}, controllers = {};

export function build_gui_params_and_uniforms(
  paramset = parameters, uniformset = uniforms, guiparamset = guiparams
) {
  Object.keys(paramset).map(key => {
    const param = paramset[key];

    if (param.hasOwnProperty('value')) { // It's a value.
      const { value, min, max, step } = param;

      if (Array.isArray(value)) { // It's a vector.
        // Make a shader parameter, a GUI parameter binding, and a controller.
        const vector = 
          value.length == 2 ? new THREE.Vector2() : 
          value.length == 3 ? new THREE.Vector3() : 
          new THREE.Vector4();

        vector.fromArray(value);
        uniformset[key] = { value: vector };
        guiparamset[key] = vector;
      } else { // It's a number or boolean.
        guiparamset[key] = value;
        uniformset[key] = { value: value };
      }
    } else { // It's a folder.
      guiparamset[key] = {};
      uniformset[key] = {};
      build_gui_params_and_uniforms(
        paramset[key], uniformset[key], guiparamset[key]
      );
    }
  });
}

export function build_gui_controllers(
  paramset = parameters, guiparamset = guiparams, uniformset = uniforms,
  controllerset = controllers, folder
) {
  Object.keys(paramset).map(key => {
    const gui_param = guiparamset[key];
    const param = paramset[key];

    if (param.hasOwnProperty('value')) {
      const is_slider = ['min', 'max', 'step']
        .every(v => param.hasOwnProperty(v));

      if (Array.isArray(param.value)) {
        const vfolder = folder.addFolder(key);
        controllerset[key] = {};
        param.value.map((v, i) => {
          var d = ['x', 'y', 'z', 'w'][i];
          controllerset[key][d] = is_slider ?
            vfolder.add(
              gui_param, d, param.min[i], param.max[i], param.step[i]
            ) :
            vfolder.add(gui_param, d);
        });
      } else {
        if (is_slider) {
          controllerset[key] = 
            folder.add(guiparamset, key, param.min, param.max, param.step);
        } else if (param.hasOwnProperty('options')) {
          controllerset[key] = folder.add(guiparamset, key, param.options);
        } else {
          controllerset[key] = folder.add(guiparamset, key);
        }

        controllerset[key].onChange(v => uniformset[key].value = v);
      }
    } else if (typeof param === 'object') {
      controllerset[key] = {};
      build_gui_controllers(
        param,
        gui_param,
        uniformset[key],
        controllerset[key],
        folder.addFolder(key)
      );
    }
  });
}
