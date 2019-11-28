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
from sirepo import simulation_db
from sirepo.template import template_common
import inspect
import pykern.pkio
import re
import requests
import sirepo.auth
import sirepo.http_reply
import sirepo.http_request
import sirepo.job
import sirepo.mpi
import sirepo.sim_data
import sirepo.util


#: how many call frames to search backwards to find the api_.* caller
_MAX_FRAME_SEARCH_DEPTH = 6

@api_perm.require_user
def api_downloadDataFile(simulation_type, simulation_id, model, frame, suffix=None):
#TODO(robnagler) validate suffix and frame
    req = sirepo.http_request.parse_params(
        id=simulation_id,
        model=model,
        type=simulation_type,
    )
    s = suffix and sireop.srschema.parse_name(suffix)
    t = None
    with simulation_db.tmp_dir() as d:
        # TODO(e-carlin): computeJobHash
        t = sirepo.job.DATA_FILE_ROOT.join(sirepo.job.unique_key())
        t.mksymlinkto(d, absolute=True)
        try:
            _request(
                frame=int(frame),
                suffix=s,
                computeJobHash='unused',
                dataFileUri=sirepo.job.DATA_FILE_ABS_URI + t.basename + '/',
                req_data=req.req_data,
            )
            f = d.listdir()
            if len(f) > 0:
                assert len(f) == 1, \
                    'too many files={}'.format(f)
                return sirepo.http_reply.gen_file_as_attachment(f[0])
        except requests.exceptions.HTTPError:
#TODO(robnagler) HTTPError is too coarse a check
            pass
        finally:
            if t:
                pykern.pkio.unchecked_remove(t)
        raise sirepo.util.raise_not_found(
            'frame={} not found {id} {type}'.format(frame, **req)
        )

@api_perm.require_user
def api_runCancel():
    return _request()


@api_perm.require_user
def api_runSimulation():
    t = None
    try:
        r = _request_data(PKDict(fixup_old_data=True))
        d = simulation_db.simulation_lib_dir(r.simulationType)
        p = d.join(sirepo.job.LIB_FILE_LIST_URI[1:])
        pykern.pkio.unchecked_remove(p)
        sirepo.util.json_dump(
            [x.basename for x in d.listdir()],
            path=p,
        )
        t = sirepo.job.LIB_FILE_ROOT.join(sirepo.job.unique_key())
        t.mksymlinkto(d, absolute=False)
        r.libFileUri = sirepo.job.LIB_FILE_ABS_URI + t.basename + '/'
        return _request(_request_data=r)
    finally:
        if t:
            pykern.pkio.unchecked_remove(t)

@api_perm.require_user
def api_runStatus():
    return _request()


@api_perm.require_user
def api_simulationFrame(frame_id):
    return template_common.sim_frame(
        frame_id,
        lambda a: _request(
            analysisModel=a.frameReport,
            # simulation frames are always sequential requests even though
            # the report name has 'animation' in it.
            isParallel=False,
            req_data=PKDict(**a),
        )
    )


def init_apis(*args, **kwargs):
    pykern.pkio.unchecked_remove(sirepo.job.LIB_FILE_ROOT)


def _request(**kwargs):
    d = kwargs.get('_request_data') or _request_data(PKDict(kwargs))
    r = requests.post(
        sirepo.job.SERVER_URI,
        data=pkjson.dump_bytes(d),
        headers=PKDict({'Content-type': 'application/json'}),
    )
    r.raise_for_status()
    return pkjson.load_any(r.content)


def _request_data(kwargs):
    def get_api_name():
        f = inspect.currentframe()
        for _ in range(_MAX_FRAME_SEARCH_DEPTH):
            m = re.search(r'^api_.*$', f.f_code.co_name)
            if m:
                return m.group()
            f = f.f_back
        else:
            raise AssertionError(
                '{}: max frame search depth reached'.format(f.f_code)
            )

    d = kwargs.pkdel('req_data')
    if not d:
        d = sirepo.http_request.parse_post(
            fixup_old_data=kwargs.pkdel('fixup_old_data', False),
            id=True,
            model=True,
        ).req_data
    s = sirepo.sim_data.get_class(d)
##TODO(robnagler) this should be req_data
    b = PKDict(data=d, **kwargs)
# TODO(e-carlin): some of these fields are only used for some type of reqs
    return b.pksetdefault(
        simulationId=s.parse_sid(d),
        analysisModel=d.report,
        api=get_api_name(),
        computeJid=lambda: s.parse_jid(d),
        computeJobHash=lambda: d.get('computeJobHash') or s.compute_job_hash(d),
        computeModel=lambda: s.compute_model(d),
        isParallel=lambda: s.is_parallel(d),
        reqId=sirepo.job.unique_key(),
#TODO(robnagler) relative to srdb root
        runDir=lambda: str(simulation_db.simulation_run_dir(d)),
        simulationType=d.simulationType,
        uid=sirepo.auth.logged_in_user(),
    ).pksetdefault(
#TODO(robnagler) configurable by request
        mpiCores=lambda: sirepo.mpi.cfg.cores if b.isParallel else 1,
        userDir=lambda: str(sirepo.simulation_db.user_dir_name(b.uid)),
    )
