# -*- coding: utf-8 -*-
u"""Entry points for job execution

:copyright: Copyright (c) 2019 RadiaSoft LLC.  All Rights Reserved.
:license: http://www.apache.org/licenses/LICENSE-2.0.html
"""
from __future__ import absolute_import, division, print_function
from pykern import pkinspect, pkjson
from pykern.pkcollections import PKDict
from pykern.pkdebug import pkdc, pkdexc, pkdlog, pkdp, pkdpretty
from sirepo import api_perm
import sirepo.http_request
import sirepo.job
import sirepo.mpi
from sirepo import simulation_db
from sirepo import srdb
from sirepo import srtime
from sirepo.template import template_common
import calendar
import datetime
import inspect
import requests
import sirepo.auth
import sirepo.sim_data
import sirepo.template
import time


_YEAR = datetime.timedelta(365)


@api_perm.require_user
def api_runCancel():
    return _request()


@api_perm.require_user
def api_runSimulation():
    return _request(fixup_old_data=1)


@api_perm.require_user
def api_runStatus():
    return _request()


@api_perm.require_user
def api_simulationFrame(frame_id):
    # fram_id is parsed by template_common
    return template_common.sim_frame(frame_id, lambda a: _request(data=a))


def init_apis(*args, **kwargs):
    pass


def _request(**kwargs):
    r = requests.post(
        sirepo.job.cfg.supervisor_uri,
        data=pkjson.dump_bytes(_request_data(PKDict(kwargs))),
        headers=PKDict({'Content-type': 'application/json'}),
    )
    r.raise_for_status()
    return pkjson.load_any(r.content)


def _request_data(kwargs):
    d = kwargs.pkdel('data')
    if not d:
        d = sirepo.http_request.parse_post(
            fixup_old_data=kwargs.pkdel('fixup_old_data'),
            id=1,
            model=1,
        ).req_data
    s = sirepo.sim_data.get_class(d)
    b = PKDict(data=d)
    return b.pksetdefault(
        analysisModel=d.report,
        api=inspect.currentframe().f_back.f_back.f_code.co_name,
        computeJid=lambda: s.parse_jid(d),
        computeJobHash=lambda: d.get('computeJobHash') or s.compute_job_hash(d),
        computeModel=lambda: s.compute_model(d),
        isParallel=lambda: s.is_parallel(d),
        reqId=sirepo.job.unique_key(),
        runDir=lambda: str(simulation_db.simulation_run_dir(d)),
        simulationType=d.simulationType,
        uid=sirepo.auth.logged_in_user(),
    ).pksetdefault(
        libDir=lambda: str(sirepo.simulation_db.simulation_lib_dir(b.simulationType)),
        mpiCores=lambda: sirepo.mpi.cfg.cores if b.isParallel else 1,
        userDir=lambda: str(sirepo.simulation_db.user_dir_name(b.uid)),
    )
