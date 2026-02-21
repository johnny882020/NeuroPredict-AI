import React, { useEffect, useRef } from 'react';
import '@kitware/vtk.js/Rendering/Profiles/Geometry';
import vtkGenericRenderWindow from '@kitware/vtk.js/Rendering/Misc/GenericRenderWindow';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import vtkPolyData from '@kitware/vtk.js/Common/DataModel/PolyData';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';

const COLOR_STOPS = [
    { label: 'Low', color: '#3b82f6' },
    { label: '', color: '#22c55e' },
    { label: '', color: '#eab308' },
    { label: 'High', color: '#ef4444' },
];

const ColorBarLegend = ({ wssRange }) => {
    const [min, max] = wssRange || [0, 1];
    return (
        <div style={{
            position: 'absolute', right: 16, top: 16, bottom: 16, width: 28,
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            pointerEvents: 'none',
        }}>
            <span style={{ fontSize: 11, color: '#334155', marginBottom: 4, fontWeight: 600 }}>
                WSS (Pa)
            </span>
            <span style={{ fontSize: 10, color: '#64748b', marginBottom: 2 }}>
                {max.toFixed(1)}
            </span>
            <div style={{
                flex: 1, width: 16, borderRadius: 4,
                background: 'linear-gradient(to bottom, #ef4444, #eab308, #22c55e, #3b82f6)',
                border: '1px solid #cbd5e1',
            }} />
            <span style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>
                {min.toFixed(1)}
            </span>
        </div>
    );
};

const Viewer3D = ({ meshData, vertexWss, wssRange }) => {
    const vtkContainerRef = useRef(null);
    const context = useRef(null);

    useEffect(() => {
        if (!vtkContainerRef.current) return;

        if (!context.current) {
            const genericRenderWindow = vtkGenericRenderWindow.newInstance({
                background: [0.95, 0.96, 0.98],
            });
            genericRenderWindow.setContainer(vtkContainerRef.current);

            const renderer = genericRenderWindow.getRenderer();
            const renderWindow = genericRenderWindow.getRenderWindow();

            const polyData = vtkPolyData.newInstance();
            const mapper = vtkMapper.newInstance();
            const actor = vtkActor.newInstance();

            actor.setMapper(mapper);
            mapper.setInputData(polyData);
            renderer.addActor(actor);

            context.current = { genericRenderWindow, polyData, renderWindow, renderer, actor, mapper };
        }

        if (meshData && meshData.vertices && meshData.faces) {
            const { polyData, renderer, renderWindow, mapper } = context.current;

            const flatVertices = meshData.vertices.flat();
            polyData.getPoints().setData(Float32Array.from(flatVertices), 3);

            const vtkFaces = [];
            meshData.faces.forEach(face => {
                vtkFaces.push(3, ...face);
            });
            polyData.getPolys().setData(Uint32Array.from(vtkFaces));

            if (vertexWss && vertexWss.length > 0) {
                const wssArray = vtkDataArray.newInstance({
                    name: 'WSS',
                    values: Float32Array.from(vertexWss),
                    numberOfComponents: 1,
                });
                polyData.getPointData().setScalars(wssArray);

                const [wMin, wMax] = wssRange || [
                    Math.min(...vertexWss),
                    Math.max(...vertexWss),
                ];

                const ctf = vtkColorTransferFunction.newInstance();
                ctf.addRGBPoint(wMin, 0.23, 0.51, 0.96);           // Blue
                ctf.addRGBPoint(wMin + (wMax - wMin) * 0.33, 0.13, 0.77, 0.37); // Green
                ctf.addRGBPoint(wMin + (wMax - wMin) * 0.66, 0.92, 0.70, 0.03); // Yellow
                ctf.addRGBPoint(wMax, 0.94, 0.27, 0.27);           // Red

                mapper.setLookupTable(ctf);
                mapper.setScalarModeToUsePointData();
                mapper.setColorModeToMapScalars();
                mapper.setScalarRange(wMin, wMax);
                mapper.setScalarVisibility(true);
            } else {
                context.current.actor.getProperty().setColor(0.8, 0.2, 0.2);
                mapper.setScalarVisibility(false);
            }

            polyData.modified();
            renderer.resetCamera();
            renderWindow.render();
        }

        return () => {
            if (context.current) {
                context.current.genericRenderWindow.delete();
                context.current = null;
            }
        };
    }, [meshData, vertexWss, wssRange]);

    const hasWss = vertexWss && vertexWss.length > 0;

    return (
        <div style={{
            width: '100%', height: '500px', border: '1px solid #e2e8f0',
            borderRadius: 8, overflow: 'hidden', position: 'relative',
            background: '#f1f2f5',
        }}>
            <div ref={vtkContainerRef} style={{ width: '100%', height: '100%' }} />
            {hasWss && <ColorBarLegend wssRange={wssRange || [Math.min(...vertexWss), Math.max(...vertexWss)]} />}
        </div>
    );
};

export default Viewer3D;
