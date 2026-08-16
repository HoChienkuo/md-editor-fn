export type FnosApiRequest<TData> = {
    reqId: string;
    req: string;
    appName: string;
    data: TData;
};

export type FnosApiResponse<TData> = {
    reqId: string;
    code: number;
    msg: string;
    data: TData;
};

export type FilePermission = {
    path: string;
    readable: boolean;
    writable: boolean;
    deletable: boolean;
};

export type ConvertedPath = {
    path: string;
    semanticPath: string;
};

export type ConvertPathResponse = {
    status: number;
    result: ConvertedPath[];
};