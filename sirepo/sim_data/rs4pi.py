# -*- coding: utf-8 -*-
u"""rs4pi simulation data operations

:copyright: Copyright (c) 2019 RadiaSoft LLC.  All Rights Reserved.
:license: http://www.apache.org/licenses/LICENSE-2.0.html
"""
from __future__ import absolute_import, division, print_function
from pykern import pkcollections
from pykern.pkdebug import pkdp
from sirepo import simulation_db
import sirepo.sim_data


class SimData(sirepo.sim_data.SimDataBase):

    @classmethod
    def fixup_old_data(cls, data):
        dm = data.models
        if 'dicomEditorState' not in dm:
            dm.dicomEditorState = pkcollections.Dict()
        if 'doseCalculation' not in dm:
            dm.doseCalculation = pkcollections.Dict(
                selectedPTV='',
                selectedOARs=[],
            )
        if 'dicomDose' not in dm:
            dm.dicomDose = pkcollections.Dict(frameCount=0)
        if 'dicomAnimation4' not in dm:
            anim = dm.dicomAnimation
            dm.dicomAnimation4 = pkcollections.Dict(
                dicomPlane='t',
                startTime=anim.get('startTime', 0),
            }
        if 'dvhReport' not in dm:
            dm.dvhReport = pkcollections.Dict(roiNumber='')
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
