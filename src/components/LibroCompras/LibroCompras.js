import React from 'react';
import LibroTransacciones from '../LibroTransacciones/LibroTransacciones';
const LibroCompras = ({ usuario }) => <LibroTransacciones tipo="compra" usuario={usuario} />;
export default LibroCompras;
