//////////////////////////////////////////////////////////////////////////////////////
//
//  Copyright (c) 2014-present, Egret Technology.
//  All rights reserved.
//  Redistribution and use in source and binary forms, with or without
//  modification, are permitted provided that the following conditions are met:
//
//     * Redistributions of source code must retain the above copyright
//       notice, this list of conditions and the following disclaimer.
//     * Redistributions in binary form must reproduce the above copyright
//       notice, this list of conditions and the following disclaimer in the
//       documentation and/or other materials provided with the distribution.
//     * Neither the name of the Egret nor the
//       names of its contributors may be used to endorse or promote products
//       derived from this software without specific prior written permission.
//
//  THIS SOFTWARE IS PROVIDED BY EGRET AND CONTRIBUTORS "AS IS" AND ANY EXPRESS
//  OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES
//  OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED.
//  IN NO EVENT SHALL EGRET AND CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT,
//  INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
//  LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;LOSS OF USE, DATA,
//  OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
//  LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
//  NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE,
//  EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
//
//////////////////////////////////////////////////////////////////////////////////////


module RES {




	/**
	 * @class RES.ResourceLoader
	 * @classdesc
	 * @extends egret.EventDispatcher
	 * @private
	 */
	export class ResourceLoader extends egret.EventDispatcher {
		/**
		 * 构造函数
		 * @method RES.ResourceLoader#constructor
		 */
		public constructor() {
			super();
		}
        /**
         * 最大并发加载数
         */
		public thread: number = 2;
        /**
         * 正在加载的线程计数
         */
		private loadingCount: number = 0;

        /**
         * RES单例的引用
		 * @member {any} RES.ResourceLoader#resInstance
         */
		public resInstance: Resource;;

		/**
		 * 当前组加载的项总个数,key为groupName
		 */
		private groupTotalDic: any = {};
		/**
		 * 已经加载的项个数,key为groupName
		 */
		private numLoadedDic: any = {};
		/**
		 * 正在加载的组列表,key为groupName
		 */
		private itemListDic: any = {};
		/**
		 * 加载失败的组,key为groupName
		 */
		private groupErrorDic: any = {};

		private retryTimesDic: any = {};
		public maxRetryTimes = 3;
		private failedList: Array<ResourceItem> = new Array<ResourceItem>();

		private queue: string[] = [];
		/**
		 * 检查指定的组是否正在加载中
		 * @method RES.ResourceLoader#isGroupInLoading
		 * @param groupName {string}
		 * @returns {boolean}
		 */
		public isGroupInLoading(groupName: string): boolean {
			return this.itemListDic[groupName] !== undefined;
		}
		/**
		 * 开始加载一组文件
		 * @method RES.ResourceLoader#loadGroup
		 * @param list {egret.Array<ResourceItem>} 加载项列表
		 * @param groupName {string} 组名
		 * @param priority {number} 加载优先级
		 */
		public loadGroup(list: Array<ResourceItem>, groupName: string, priority: number = 0): void {
			if (this.itemListDic[groupName] || !groupName)
				return;
			if (!list || list.length == 0) {
				egret.$warn(3201, groupName);
				var event: ResourceEvent = new ResourceEvent(ResourceEvent.GROUP_LOAD_ERROR);
				event.groupName = groupName;
				this.dispatchEvent(event);
				return;
			}

			this.queue.push(groupName);
			this.itemListDic[groupName] = list;
			var length: number = list.length;
			for (var i: number = 0; i < length; i++) {
				var resItem = list[i];
				resItem.groupName = groupName;
			}
			this.groupTotalDic[groupName] = list.length;
			this.numLoadedDic[groupName] = 0;
			this.next();
		}

		/**
		 * 加载下一项
		 */
		private next(): void {

			let load = (r: ResourceItem) => {
				host.load(r)
					.then(response => {
						host.save(r, response);
						r.loaded = true;
						this.onItemComplete(r);
					})
			}

			let processor: Processor | undefined;

			while (this.loadingCount < this.thread) {
				let resItem = this.getOneResourceItem();
				if (!resItem)
					break;
				this.loadingCount++;

				if (resItem.loaded) {
					this.onItemComplete(resItem);
				}
				else if (load(resItem)) {
					;
				}
			}
		}

		/**
		 * 当前应该加载同优先级队列的第几列
		 */
		private queueIndex: number = 0;
		/**
		 * 获取下一个待加载项
		 */
		private getOneResourceItem(): ResourceItem | undefined {
			if (this.failedList.length > 0)
				return this.failedList.shift();
			var queue: Array<any> = this.queue;
			var length = queue.length;
			var list: Array<ResourceItem> = [];
			for (var i: number = 0; i < length; i++) {
				if (this.queueIndex >= length)
					this.queueIndex = 0;
				list = this.itemListDic[queue[this.queueIndex]];
				if (list.length > 0)
					break;
				this.queueIndex++;
			}
			if (list.length == 0)
				return undefined;
			return list.shift();
		}
		/**
		 * 加载结束
		 */
		private onItemComplete(resItem: ResourceItem): void {
			this.loadingCount--;
			var groupName: string = resItem.groupName;
			if (!resItem.loaded) {//加载失败
				var times = this.retryTimesDic[resItem.name] || 1;
				if (times > this.maxRetryTimes) {
					delete this.retryTimesDic[resItem.name];
					ResourceEvent.dispatchResourceEvent(this.resInstance, ResourceEvent.ITEM_LOAD_ERROR, groupName, resItem);
				}
				else {
					this.retryTimesDic[resItem.name] = times + 1;
					this.failedList.push(resItem);
					this.next();
					return;
				}
			}

			if (groupName) {
				this.numLoadedDic[groupName]++;
				var itemsLoaded: number = this.numLoadedDic[groupName];
				var itemsTotal: number = this.groupTotalDic[groupName];
				if (!resItem.loaded) {
					this.groupErrorDic[groupName] = true;
				}
				ResourceEvent.dispatchResourceEvent(this.resInstance, ResourceEvent.GROUP_PROGRESS, groupName, resItem, itemsLoaded, itemsTotal);
				if (itemsLoaded == itemsTotal) {
					var groupError: boolean = this.groupErrorDic[groupName];
					this.removeGroupName(groupName);
					delete this.groupTotalDic[groupName];
					delete this.numLoadedDic[groupName];
					delete this.itemListDic[groupName];
					delete this.groupErrorDic[groupName];
					if (groupError) {
						ResourceEvent.dispatchResourceEvent(this, ResourceEvent.GROUP_LOAD_ERROR, groupName);
					}
					else {
						ResourceEvent.dispatchResourceEvent(this, ResourceEvent.GROUP_COMPLETE, groupName);
					}
				}
			}
			else {
				// this.callBack.call(this.resInstance, resItem);
			}
			this.next();
		}
		/**
		 * 从优先级队列中移除指定的组名
		 */
		private removeGroupName(groupName: string): void {
			var queue = this.queue;
			var length = queue.length;
			var index = 0;
			var found = false;
			var length = queue.length;
			for (var i = 0; i < length; i++) {
				var name = queue[i];
				if (name == groupName) {
					queue.splice(index, 1);
					found = true;
					break;
				}
				index++;
			}
		}
	}
}
