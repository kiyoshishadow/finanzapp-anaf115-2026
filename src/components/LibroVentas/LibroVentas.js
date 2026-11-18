import React from 'react';
import LibroTransacciones from '../LibroTransacciones/LibroTransacciones';
const LibroVentas = ({ usuario }) => <LibroTransacciones tipo="venta" usuario={usuario} />;
export default LibroVentas;
