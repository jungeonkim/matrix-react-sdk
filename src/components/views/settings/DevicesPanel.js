/*
Copyright 2016 OpenMarket Ltd

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import React from 'react';
import classNames from 'classnames';

import sdk from '../../../index';
import MatrixClientPeg from '../../../MatrixClientPeg';
import { _t } from '../../../languageHandler';
import Modal from '../../../Modal';

export default class DevicesPanel extends React.Component {
    constructor(props, context) {
        super(props, context);

        this.state = {
            devices: undefined,
            deviceLoadError: undefined,

            selectedDevices: [],
            deleting: false,
        };

        this._unmounted = false;

        this._renderDevice = this._renderDevice.bind(this);
        this._onDeviceSelectionToggled = this._onDeviceSelectionToggled.bind(this);
        this._onDeleteClick = this._onDeleteClick.bind(this);
    }

    componentDidMount() {
        this._loadDevices();
    }

    componentWillUnmount() {
        this._unmounted = true;
    }

    _loadDevices() {
        MatrixClientPeg.get().getDevices().done(
            (resp) => {
                if (this._unmounted) { return; }
                this.setState({devices: resp.devices || []});
            },
            (error) => {
                if (this._unmounted) { return; }
                let errtxt;
                if (error.httpStatus == 404) {
                    // 404 probably means the HS doesn't yet support the API.
                    errtxt = _t("Your home server does not support device management.");
                } else {
                    console.error("Error loading devices:", error);
                    errtxt = _t("Unable to load device list");
                }
                this.setState({deviceLoadError: errtxt});
            },
        );
    }


    /**
     * compare two devices, sorting from most-recently-seen to least-recently-seen
     * (and then, for stability, by device id)
     */
    _deviceCompare(a, b) {
        // return < 0 if a comes before b, > 0 if a comes after b.
        const lastSeenDelta =
              (b.last_seen_ts || 0) - (a.last_seen_ts || 0);

        if (lastSeenDelta !== 0) { return lastSeenDelta; }

        const idA = a.device_id;
        const idB = b.device_id;
        return (idA < idB) ? -1 : (idA > idB) ? 1 : 0;
    }

    _onDeviceSelectionToggled(device) {
        if (this._unmounted) { return; }

        const deviceId = device.device_id;
        this.setState((state, props) => {
            // Make a copy of the selected devices, then add or remove the device
            const selectedDevices = state.selectedDevices.slice();

            const i = selectedDevices.indexOf(deviceId);
            if (i === -1) {
                selectedDevices.push(deviceId);
            } else {
                selectedDevices.splice(i, 1);
            }

            return {selectedDevices};
        });
    }

    _onDeleteClick() {
        this.setState({
            deleting: true,
        });

        this._makeDeleteRequest(null).catch((error) => {
            if (this._unmounted) { return; }
            if (error.httpStatus !== 401 || !error.data || !error.data.flows) {
                // doesn't look like an interactive-auth failure
                throw error;
            }

            // pop up an interactive auth dialog
            const InteractiveAuthDialog = sdk.getComponent("dialogs.InteractiveAuthDialog");

            Modal.createTrackedDialog('Delete Device Dialog', '', InteractiveAuthDialog, {
                title: _t("Authentication"),
                matrixClient: MatrixClientPeg.get(),
                authData: error.data,
                makeRequest: this._makeDeleteRequest.bind(this),
            });
        }).catch((e) => {
            console.error("Error deleting devices", e);
            if (this._unmounted) { return; }
        }).finally(() => {
            this.setState({
                deleting: false,
            });
        });
    }

    _makeDeleteRequest(auth) {
        return MatrixClientPeg.get().deleteMultipleDevices(this.state.selectedDevices, auth).then(
            () => {
                // Remove the deleted devices from `devices`, reset selection to []
                this.setState({
                    devices: this.state.devices.filter(
                        (d) => !this.state.selectedDevices.includes(d.device_id),
                    ),
                    selectedDevices: [],
                });
            },
        );
    }

    _renderDevice(device) {
        const DevicesPanelEntry = sdk.getComponent('settings.DevicesPanelEntry');
        return <DevicesPanelEntry
            key={device.device_id}
            device={device}
            selected={this.state.selectedDevices.includes(device.device_id)}
            onDeviceToggled={this._onDeviceSelectionToggled}
        />;
    }

    render() {
        const Spinner = sdk.getComponent("elements.Spinner");

        if (this.state.deviceLoadError !== undefined) {
            const classes = classNames(this.props.className, "error");
            return (
                <div className={classes}>
                    { this.state.deviceLoadError }
                </div>
            );
        }

        const devices = this.state.devices;
        if (devices === undefined) {
            // still loading
            const classes = this.props.className;
            return <Spinner className={classes} />;
        }

        devices.sort(this._deviceCompare);

        const deleteButton = this.state.deleting ?
            <Spinner w={22} h={22} /> :
            <div className="mx_textButton" onClick={this._onDeleteClick}>
               { _t("Delete %(count)s devices", {count: this.state.selectedDevices.length}) }
            </div>;

        const classes = classNames(this.props.className, "mx_DevicesPanel");
        return (
            <div className={classes}>
                <div className="mx_DevicesPanel_header">
                    <div className="mx_DevicesPanel_deviceId">{ _t("Device ID") }</div>
                    <div className="mx_DevicesPanel_deviceName">{ _t("Device Name") }</div>
                    <div className="mx_DevicesPanel_deviceLastSeen">{ _t("Last seen") }</div>
                    <div className="mx_DevicesPanel_deviceButtons">
                        { this.state.selectedDevices.length > 0 ? deleteButton : _t('Select devices') }
                    </div>
                </div>
                { devices.map(this._renderDevice) }
            </div>
        );
    }
}

DevicesPanel.displayName = 'MemberDeviceInfo';
DevicesPanel.propTypes = {
    className: React.PropTypes.string,
};
