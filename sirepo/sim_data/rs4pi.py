# -*- coding: utf-8 -*-
u"""simulation data operations

:copyright: Copyright (c) 2019 RadiaSoft LLC.  All Rights Reserved.
:license: http://www.apache.org/licenses/LICENSE-2.0.html
"""
from __future__ import absolute_import, division, print_function
from pykern.pkcollections import PKDict
from pykern.pkdebug import pkdc, pkdlog, pkdp
from sirepo import simulation_db
import sirepo.sim_data


class SimData(sirepo.sim_data.SimDataBase):

    RS4PI_BEAMLIST_FILENAME = 'beamlist_72deg.txt'

    @classmethod
    def animation_name(cls, data):
        if data['modelName'].startswith('dicomAnimation'):
            return 'dicomAnimation'
        if data['modelName'] == 'dicomDose':
            # if the doseCalculation has been run, use that directory for work
            # otherwise, it is an imported dose file
            if simulation_db.simulation_dir(SIM_TYPE, data.simulationId).join('doseCalculation').exists():
                return 'doseCalculation'
            return 'dicomAnimation'
        return data['modelName']


    @classmethod
    def fixup_old_data(cls, data):
        dm = data.models
        dm.setdefault(
            'dicomEditorState', PKDict(),
            'doseCalculation', PKDict(selectedPTV='', selectedOARs=[]),
            'dicomDose', PKDict(frameCount=0),
            'dicomAnimation4', PKDict(
                dicomPlane='t',
                startTime=dm.dicomAnimation.get('startTime', 0),
            ),
            'dvhReport', PKDict(roiNumber=''),
        )
        if 'dvhType' not in dm.dvhReport:
            dm.dvhReport.update(
                dvhType='cumulative',
                dvhVolume='relative',
            )
        x = dm.dvhReport
        if 'roiNumbers' not in x and x.get('roiNumber', None):
            x.roiNumbers = [x.roiNumber]
            del x['roiNumber']
        dm.dicomAnimation4.setdefault('doseTransparency', 56)


    @classmethod
    def resource_files(cls):
        return cls.resource_glob('beamlist*.txt')

    @classmethod
    def _compute_job_fields(cls, data):
        r = data.report
        if r == 'doseCalculation':
            return []
        if r == 'dvhReport':
            return [r, 'dicomDose']
        return [r]

    @classmethod
    def _lib_files(cls, data):
        return [cls.RS4PI_BEAMLIST_FILENAME]